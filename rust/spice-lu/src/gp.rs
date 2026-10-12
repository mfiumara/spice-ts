//! Gilbert-Peierls left-looking sparse LU, a port of
//! `packages/core/src/solver/gilbert-peierls.ts`.
//!
//! Same algorithm and the same decisions as the TypeScript solver:
//! AMD on A + Aᵀ, structural column singletons first, left-looking
//! column-Crout with a min-heap of active columns (fixing the summation
//! order), threshold partial pivoting (0.1) that prefers the symmetrically
//! permuted diagonal, and pivot reuse (`refactor`) that only succeeds when the
//! full kernel would make exactly the same choices. The factors, and hence
//! the solution, are therefore bit-identical to the TypeScript solver on the
//! same input — the spike harness checks this.

use crate::amd::amd_ordering;
use crate::CscPattern;

/// Fill-reducing column ordering applied once per pattern.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ordering {
    Amd,
    Natural,
}

/// Numerically singular at the given original column (or non-finite solution).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Singular {
    pub column: usize,
}

const PIVOT_THRESHOLD: f64 = 0.1;
const TINY: f64 = 1e-18;

#[derive(Default)]
pub struct GilbertPeierls {
    n: usize,
    col_ptr: Vec<i32>,
    row_idx: Vec<i32>,

    col_perm: Vec<i32>,
    row_pref: Vec<i32>,

    l_col_ptr: Vec<usize>,
    l_rows: Vec<i32>,
    l_values: Vec<f64>,
    u_col_ptr: Vec<usize>,
    u_rows: Vec<i32>,
    u_values: Vec<f64>,
    perm: Vec<i32>,

    workspace: Vec<f64>,
    pinv: Vec<i32>,
    nonzero_flag: Vec<i64>,
    nonzero_list: Vec<i32>,
    active_k: Vec<i32>,
    workspace_dirty: bool,

    analyzed: bool,
    factorized: bool,
    pivots_valid: bool,
    factored_values: Vec<f64>,

    scatter_pos: Vec<i32>,
    nat_pos: Vec<i32>,
    zero_ptr: Vec<usize>,
    zero_rows: Vec<i32>,

    pub numeric_count: u64,
    pub refactor_count: u64,
}

impl GilbertPeierls {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn n(&self) -> usize {
        self.n
    }

    /// Symbolic phase: ordering and buffer sizing for this sparsity pattern.
    /// The pattern is copied; later `factorize` calls pass values only.
    pub fn analyze_pattern(
        &mut self,
        n: usize,
        col_ptr: &[i32],
        row_idx: &[i32],
        ordering: Ordering,
    ) {
        self.n = n;
        self.col_ptr = col_ptr[..n + 1].to_vec();
        self.row_idx = row_idx[..col_ptr[n] as usize].to_vec();
        let pat = CscPattern {
            n,
            col_ptr: &self.col_ptr,
            row_idx: &self.row_idx,
        };
        let order = match ordering {
            Ordering::Amd => amd_ordering(&pat),
            Ordering::Natural => (0..n as i32).collect(),
        };
        let (col_perm, row_pref) = column_singletons_first(&pat, &order);
        self.col_perm = col_perm;
        self.row_pref = row_pref;

        let mut l_nnz = 0;
        let mut u_nnz = 0;
        for j in 0..n {
            let mut has_diag = false;
            for p in self.col_ptr[j] as usize..self.col_ptr[j + 1] as usize {
                let row = self.row_idx[p] as usize;
                if row > j {
                    l_nnz += 1;
                } else {
                    u_nnz += 1;
                }
                if row == j {
                    has_diag = true;
                }
            }
            if !has_diag {
                u_nnz += 1;
            }
        }
        self.l_col_ptr = vec![0; n + 1];
        self.l_rows = Vec::with_capacity(l_nnz);
        self.l_values = Vec::with_capacity(l_nnz);
        self.u_col_ptr = vec![0; n + 1];
        self.u_rows = Vec::with_capacity(u_nnz);
        self.u_values = Vec::with_capacity(u_nnz);
        self.perm = vec![0; n];
        self.workspace = vec![0.0; n];
        self.pinv = vec![0; n];
        self.nonzero_flag = vec![0; n];
        self.nonzero_list = vec![0; n];
        self.active_k = vec![0; n];
        self.nat_pos = vec![0; n];
        self.zero_ptr = vec![0; n + 1];
        self.zero_rows = Vec::with_capacity(16);
        self.workspace_dirty = false;
        self.analyzed = true;
        self.factorized = false;
        self.pivots_valid = false;
        self.factored_values.clear();
    }

    /// Stored factor non-zeros: strictly lower L plus U with its diagonal.
    pub fn factor_nonzeros(&self) -> usize {
        self.l_col_ptr[self.n] + self.u_col_ptr[self.n]
    }

    /// Heap bytes owned by the solver (capacity, not length). Diagnostics only.
    pub fn heap_bytes(&self) -> usize {
        4 * (self.col_ptr.capacity()
            + self.row_idx.capacity()
            + self.col_perm.capacity()
            + self.row_pref.capacity()
            + self.l_rows.capacity()
            + self.u_rows.capacity()
            + self.perm.capacity()
            + self.pinv.capacity()
            + self.nonzero_list.capacity()
            + self.active_k.capacity()
            + self.scatter_pos.capacity()
            + self.nat_pos.capacity()
            + self.zero_rows.capacity())
            + 8 * (self.l_col_ptr.capacity()
                + self.u_col_ptr.capacity()
                + self.l_values.capacity()
                + self.u_values.capacity()
                + self.workspace.capacity()
                + self.nonzero_flag.capacity()
                + self.factored_values.capacity()
                + self.zero_ptr.capacity())
    }

    fn matches_factored_input(&self, values: &[f64]) -> bool {
        let nnz = self.col_ptr[self.n] as usize;
        if !self.factorized || self.factored_values.len() != nnz {
            return false;
        }
        // Bitwise equality distinguishes signed zeros like the TS check;
        // NaN never matches in TS (NaN !== NaN), so reject it explicitly.
        values[..nnz]
            .iter()
            .zip(&self.factored_values)
            .all(|(v, prev)| v.to_bits() == prev.to_bits() && !v.is_nan())
    }

    fn record_factored_input(&mut self, values: &[f64]) {
        let nnz = self.col_ptr[self.n] as usize;
        self.factored_values.clear();
        self.factored_values.extend_from_slice(&values[..nnz]);
    }

    /// Numeric factorization of the analyzed pattern with `values`.
    /// Mirrors TS `factorize`: skip identical input, else try pivot reuse,
    /// else run the full threshold-pivoting kernel.
    pub fn factorize(&mut self, values: &[f64]) -> Result<(), Singular> {
        assert!(self.analyzed, "must call analyze_pattern before factorize");
        if self.matches_factored_input(values) {
            return Ok(());
        }
        if self.pivots_valid && self.refactor_with_pivots(values) {
            self.workspace_dirty = false;
            self.factorized = true;
            self.numeric_count += 1;
            self.refactor_count += 1;
            self.record_factored_input(values);
            return Ok(());
        }
        self.factorize_full(values)
    }

    /// Full factorization, ignoring any previous pivots (benchmark helper; the
    /// result equals what `factorize` returns after `analyze_pattern`).
    pub fn factorize_full(&mut self, values: &[f64]) -> Result<(), Singular> {
        let n = self.n;
        let a_col_ptr = &self.col_ptr;
        let a_row_idx = &self.row_idx;
        let col_perm = &self.col_perm;
        let perm = &mut self.perm;
        let x = &mut self.workspace;
        let l_col_ptr = &mut self.l_col_ptr;
        let l_rows = &mut self.l_rows;
        let l_values = &mut self.l_values;
        let u_col_ptr = &mut self.u_col_ptr;
        let u_rows = &mut self.u_rows;
        let u_values = &mut self.u_values;
        let pinv = &mut self.pinv;
        let flag = &mut self.nonzero_flag;
        let list = &mut self.nonzero_list;
        let heap = &mut self.active_k;
        let nat_pos = &mut self.nat_pos;
        let zero_ptr = &mut self.zero_ptr;
        let zero_rows = &mut self.zero_rows;

        self.factorized = false;
        self.pivots_valid = false;
        if self.workspace_dirty {
            x.fill(0.0);
        }
        self.workspace_dirty = true;

        perm.copy_from_slice(&self.row_pref);
        pinv.fill(-1);
        flag.fill(-1);
        l_rows.clear();
        l_values.clear();
        u_rows.clear();
        u_values.clear();
        zero_rows.clear();

        for j in 0..n {
            let mut count = 0usize;
            l_col_ptr[j] = l_rows.len();
            u_col_ptr[j] = u_rows.len();
            let settled = 2 * j as i64 + 1;
            let dormant = 2 * j as i64;

            // Step 1: scatter column colPerm[j] of A (original row space).
            let col = col_perm[j] as usize;
            for p in a_col_ptr[col] as usize..a_col_ptr[col + 1] as usize {
                let r = a_row_idx[p] as usize;
                x[r] = values[p];
                if flag[r] < dormant {
                    flag[r] = dormant;
                    list[count] = r as i32;
                    count += 1;
                }
            }

            // Step 2: left-looking sparse triangular solve, ascending k via min-heap.
            let mut active = 0usize;
            for t in 0..count {
                let r = list[t] as usize;
                let k = pinv[r];
                if k < 0 {
                    flag[r] = settled;
                } else if x[r] != 0.0 {
                    flag[r] = settled;
                    heap[active] = k;
                    active += 1;
                } else {
                    flag[r] = dormant;
                }
            }
            heap[..active].sort_unstable();

            while active > 0 {
                let k = heap[0] as usize;
                active = heap_pop_min(heap, active);
                let ukj = x[perm[k] as usize];
                if ukj == 0.0 {
                    continue;
                }
                u_rows.push(k as i32);
                u_values.push(ukj);
                let p_end = l_col_ptr[k + 1];
                for p in l_col_ptr[k]..p_end {
                    let i = l_rows[p] as usize;
                    let before = x[i];
                    x[i] = before - l_values[p] * ukj;
                    if before != 0.0 {
                        continue;
                    }
                    let state = flag[i];
                    if state != settled {
                        if state != dormant {
                            list[count] = i as i32;
                            count += 1;
                        }
                        let k2 = pinv[i];
                        if k2 < 0 {
                            flag[i] = settled;
                        } else if x[i] != 0.0 {
                            flag[i] = settled;
                            active = heap_push(heap, active, k2);
                        } else {
                            flag[i] = dormant;
                        }
                    }
                }
            }

            // Step 3: threshold pivoting.
            let mut max_val = 0.0f64;
            let mut max_row: i64 = -1;
            for t in 0..count {
                let r = list[t] as usize;
                if pinv[r] < 0 {
                    let a = x[r].abs();
                    if a > max_val {
                        max_val = a;
                        max_row = r as i64;
                    }
                }
            }
            // `!(a >= TINY)` would also catch NaN; TS uses `maxVal < 1e-18`, which
            // never fires for NaN. Keep TS semantics exactly.
            if max_val < TINY {
                return Err(Singular { column: col });
            }
            let nat = perm[j] as usize;
            nat_pos[j] = nat as i32;
            let chosen = if pinv[nat] < 0 && x[nat].abs() >= PIVOT_THRESHOLD * max_val {
                nat
            } else {
                max_row as usize
            };
            let pivot = x[chosen];
            if pivot.abs() < TINY {
                return Err(Singular { column: col });
            }
            pinv[chosen] = j as i32;
            if chosen as i32 != perm[j] {
                for i in j + 1..n {
                    if perm[i] == chosen as i32 {
                        perm[i] = perm[j];
                        perm[j] = chosen as i32;
                        break;
                    }
                }
            }
            u_rows.push(j as i32);
            u_values.push(pivot);

            // Step 4: store L column j; record exact-zero touched rows.
            zero_ptr[j] = zero_rows.len();
            for t in 0..count {
                let r = list[t] as usize;
                if r == chosen {
                    continue;
                }
                if x[r] == 0.0 {
                    zero_rows.push(r as i32);
                } else if pinv[r] < 0 {
                    l_rows.push(r as i32);
                    l_values.push(x[r] / pivot);
                }
            }

            // Step 5: clear touched workspace.
            for t in 0..count {
                x[list[t] as usize] = 0.0;
            }
        }
        l_col_ptr[n] = l_rows.len();
        u_col_ptr[n] = u_rows.len();
        zero_ptr[n] = zero_rows.len();

        // Step 6: L rows and reuse data to elimination positions.
        for k in 0..n {
            pinv[perm[k] as usize] = k as i32;
        }
        for r in l_rows.iter_mut() {
            *r = pinv[*r as usize];
        }
        for r in zero_rows.iter_mut() {
            *r = pinv[*r as usize];
        }
        for k in 0..n {
            nat_pos[k] = pinv[nat_pos[k] as usize];
        }
        let nnz = a_col_ptr[n] as usize;
        self.scatter_pos.clear();
        self.scatter_pos
            .extend(a_row_idx[..nnz].iter().map(|&r| pinv[r as usize]));

        self.pivots_valid = true;
        self.workspace_dirty = false;
        self.factorized = true;
        self.numeric_count += 1;
        self.record_factored_input(values);
        Ok(())
    }

    /// Pivot-reuse refactorization. Returns false (factors invalid, caller
    /// falls back to `factorize_full`) when the full kernel would decide differently.
    fn refactor_with_pivots(&mut self, values: &[f64]) -> bool {
        let n = self.n;
        let a_col_ptr = &self.col_ptr;
        let x = &mut self.workspace;
        let l_col_ptr = &self.l_col_ptr;
        let l_rows = &self.l_rows;
        let l_values = &mut self.l_values;
        let u_col_ptr = &self.u_col_ptr;
        let u_rows = &self.u_rows;
        let u_values = &mut self.u_values;
        let nat_pos = &self.nat_pos;
        let zero_ptr = &self.zero_ptr;
        let zero_rows = &self.zero_rows;
        let scatter = &self.scatter_pos;

        self.factorized = false;
        if self.workspace_dirty {
            x.fill(0.0);
        }
        self.workspace_dirty = true;

        for j in 0..n {
            let col = self.col_perm[j] as usize;
            for p in a_col_ptr[col] as usize..a_col_ptr[col + 1] as usize {
                x[scatter[p] as usize] = values[p];
            }
            let u_start = u_col_ptr[j];
            let u_diag = u_col_ptr[j + 1] - 1;
            for q in u_start..u_diag {
                let k = u_rows[q] as usize;
                let ukj = x[k];
                if ukj == 0.0 {
                    return false;
                }
                x[k] = 0.0;
                u_values[q] = ukj;
                for p in l_col_ptr[k]..l_col_ptr[k + 1] {
                    x[l_rows[p] as usize] -= l_values[p] * ukj;
                }
            }
            for z in zero_ptr[j]..zero_ptr[j + 1] {
                if x[zero_rows[z] as usize] != 0.0 {
                    return false;
                }
            }
            let pivot = x[j];
            x[j] = 0.0;
            let nat = nat_pos[j] as usize;
            let mut nat_abs = 0.0f64;
            let mut max_l = 0.0f64;
            for p in l_col_ptr[j]..l_col_ptr[j + 1] {
                let row = l_rows[p] as usize;
                let v = x[row];
                if v == 0.0 {
                    return false;
                }
                x[row] = 0.0;
                l_values[p] = v / pivot;
                let a = v.abs();
                if a > max_l {
                    max_l = a;
                }
                if row == nat {
                    nat_abs = a;
                }
            }
            let abs_pivot = pivot.abs();
            if nat == j {
                let max_val = if abs_pivot > max_l { abs_pivot } else { max_l };
                if !(max_val >= TINY) || !(abs_pivot >= PIVOT_THRESHOLD * max_val) {
                    return false;
                }
            } else if !(abs_pivot > max_l) || nat_abs >= PIVOT_THRESHOLD * abs_pivot {
                return false;
            }
            if !(abs_pivot >= TINY) {
                return false;
            }
            u_values[u_diag] = pivot;
            for z in zero_ptr[j]..zero_ptr[j + 1] {
                x[zero_rows[z] as usize] = 0.0;
            }
        }
        true
    }

    /// Solve A x = b in place (b becomes x), like the TS solver.
    pub fn solve(&mut self, b: &mut [f64]) -> Result<(), Singular> {
        assert!(self.factorized, "must call factorize before solve");
        let n = self.n;
        let y = &mut self.workspace;
        for k in 0..n {
            y[k] = b[self.perm[k] as usize];
        }
        self.workspace_dirty = true;
        for j in 0..n {
            let yj = y[j];
            for p in self.l_col_ptr[j]..self.l_col_ptr[j + 1] {
                y[self.l_rows[p] as usize] -= self.l_values[p] * yj;
            }
        }
        for j in (0..n).rev() {
            let diag = self.u_col_ptr[j + 1] - 1;
            let zj = y[j] / self.u_values[diag];
            // Same test as TS `zj - zj !== 0`, which is true exactly for ±Inf and NaN.
            if !zj.is_finite() {
                return Err(Singular {
                    column: self.col_perm[j] as usize,
                });
            }
            b[self.col_perm[j] as usize] = zj;
            for p in self.u_col_ptr[j]..self.u_col_ptr[j + 1] {
                let i = self.u_rows[p] as usize;
                if i < j {
                    y[i] -= self.u_values[p] * zj;
                }
            }
        }
        Ok(())
    }

    /// Column ordering (step k factorizes original column `col_perm()[k]`).
    pub fn col_perm(&self) -> &[i32] {
        &self.col_perm
    }

    /// Row permutation (original row at elimination position k).
    pub fn row_perm(&self) -> &[i32] {
        &self.perm
    }
}

/// Port of TS `columnSingletonsFirst`.
fn column_singletons_first(a: &CscPattern, order: &[i32]) -> (Vec<i32>, Vec<i32>) {
    let n = a.n;
    let col_ptr = a.col_ptr;
    let row_idx = a.row_idx;
    let mut row_ptr = vec![0usize; n + 1];
    let mut remaining = vec![0i32; n];
    for j in 0..n {
        remaining[j] = col_ptr[j + 1] - col_ptr[j];
        for p in col_ptr[j] as usize..col_ptr[j + 1] as usize {
            row_ptr[row_idx[p] as usize + 1] += 1;
        }
    }
    for i in 0..n {
        row_ptr[i + 1] += row_ptr[i];
    }
    let mut row_cols = vec![0i32; row_ptr[n]];
    let mut fill: Vec<usize> = row_ptr[..n].to_vec();
    for j in 0..n {
        for p in col_ptr[j] as usize..col_ptr[j + 1] as usize {
            let r = row_idx[p] as usize;
            row_cols[fill[r]] = j as i32;
            fill[r] += 1;
        }
    }

    let mut col_perm = vec![0i32; n];
    let mut row_pref = vec![0i32; n];
    let mut row_claimed = vec![false; n];
    let mut col_placed = vec![false; n];
    let mut queue = vec![0i32; n];
    let (mut head, mut tail) = (0usize, 0usize);
    for &c in order {
        if remaining[c as usize] == 1 {
            queue[tail] = c;
            tail += 1;
        }
    }
    let mut k = 0;
    while head < tail {
        let c = queue[head] as usize;
        head += 1;
        if col_placed[c] || remaining[c] != 1 {
            continue;
        }
        let mut r = usize::MAX;
        for p in col_ptr[c] as usize..col_ptr[c + 1] as usize {
            if !row_claimed[row_idx[p] as usize] {
                r = row_idx[p] as usize;
                break;
            }
        }
        col_placed[c] = true;
        row_claimed[r] = true;
        col_perm[k] = c as i32;
        row_pref[k] = r as i32;
        k += 1;
        for p in row_ptr[r]..row_ptr[r + 1] {
            let c2 = row_cols[p] as usize;
            if !col_placed[c2] {
                remaining[c2] -= 1;
                if remaining[c2] == 1 && tail < n {
                    queue[tail] = c2 as i32;
                    tail += 1;
                }
            }
        }
    }
    let first_rest = k;
    for &c in order {
        let c = c as usize;
        if col_placed[c] {
            continue;
        }
        col_perm[k] = c as i32;
        if !row_claimed[c] {
            row_claimed[c] = true;
            row_pref[k] = c as i32;
        } else {
            row_pref[k] = -1;
        }
        k += 1;
    }
    let mut next_row = 0;
    for t in first_rest..n {
        if row_pref[t] >= 0 {
            continue;
        }
        while row_claimed[next_row] {
            next_row += 1;
        }
        row_claimed[next_row] = true;
        row_pref[t] = next_row as i32;
    }
    (col_perm, row_pref)
}

fn heap_push(heap: &mut [i32], count: usize, value: i32) -> usize {
    let mut i = count;
    while i > 0 {
        let parent = (i - 1) >> 1;
        let pv = heap[parent];
        if pv <= value {
            break;
        }
        heap[i] = pv;
        i = parent;
    }
    heap[i] = value;
    count + 1
}

fn heap_pop_min(heap: &mut [i32], count: usize) -> usize {
    let last = count - 1;
    if last == 0 {
        return 0;
    }
    let value = heap[last];
    let mut i = 0;
    loop {
        let mut child = 2 * i + 1;
        if child >= last {
            break;
        }
        if child + 1 < last && heap[child + 1] < heap[child] {
            child += 1;
        }
        let cv = heap[child];
        if cv >= value {
            break;
        }
        heap[i] = cv;
        i = child;
    }
    heap[i] = value;
    last
}
