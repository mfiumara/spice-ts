//! Approximate minimum degree ordering, a line-for-line port of
//! `packages/core/src/solver/amd-ordering.ts` (spice-ts' own quotient-graph
//! AMD, Amestoy/Davis/Duff 1996 without supervariables or mass elimination).
//!
//! The port keeps the same data layout, tie breaking and traversal order so
//! that it returns the identical permutation; `tests/equivalence.rs` and the
//! spike harness check that against the TypeScript implementation.

use crate::CscPattern;

const LIVE_VAR: u8 = 0;
const LIVE_ELEM: u8 = 1;
const DEAD: u8 = 2;
const DENSE: u8 = 3;

/// Returns `order` with `order[k] = j`: original column/row `j` is eliminated at step `k`.
pub fn amd_ordering(a: &CscPattern) -> Vec<i32> {
    let n = a.n;
    let mut order = vec![0i32; n];
    if n == 0 {
        return order;
    }
    let col_ptr = a.col_ptr;
    let row_idx = a.row_idx;

    // ---- Symmetric adjacency of A + Aᵀ without the diagonal (CSR layout). ----
    let mut counts = vec![0i32; n + 1];
    for j in 0..n {
        for p in col_ptr[j] as usize..col_ptr[j + 1] as usize {
            let i = row_idx[p] as usize;
            if i == j {
                continue;
            }
            counts[i] += 1;
            counts[j] += 1;
        }
    }
    let mut start = vec![0usize; n + 1];
    for i in 0..n {
        start[i + 1] = start[i] + counts[i] as usize;
    }
    let mut fill: Vec<usize> = start[..n].to_vec();
    let mut raw = vec![0i32; start[n]];
    for j in 0..n {
        for p in col_ptr[j] as usize..col_ptr[j + 1] as usize {
            let i = row_idx[p] as usize;
            if i == j {
                continue;
            }
            raw[fill[i]] = j as i32;
            fill[i] += 1;
            raw[fill[j]] = i as i32;
            fill[j] += 1;
        }
    }
    drop(fill);

    // Deduplicate each row.
    let mut mark = vec![-1i32; n];
    let mut adj_len = vec![0usize; n];
    let mut degree = vec![0usize; n];
    for i in 0..n {
        let mut len = 0;
        let s0 = start[i];
        for p in s0..start[i + 1] {
            let v = raw[p];
            if mark[v as usize] != i as i32 {
                mark[v as usize] = i as i32;
                raw[s0 + len] = v;
                len += 1;
            }
        }
        adj_len[i] = len;
        degree[i] = len;
    }

    // ---- Status: 0 live variable, 1 live element, 2 absorbed/dead, 3 dense. ----
    let mut status = vec![LIVE_VAR; n];
    let dense_threshold = 16usize.max((10.0 * (n as f64).sqrt()).floor() as usize);
    let mut dense_count = 0;
    for i in 0..n {
        if degree[i] > dense_threshold {
            status[i] = DENSE;
            dense_count += 1;
        }
    }
    if dense_count > 0 {
        for i in 0..n {
            if status[i] == DENSE {
                continue;
            }
            let s0 = start[i];
            let end = s0 + adj_len[i];
            let mut len = 0;
            for t in s0..end {
                if status[raw[t] as usize] != DENSE {
                    raw[s0 + len] = raw[t];
                    len += 1;
                }
            }
            adj_len[i] = len;
            degree[i] = len;
        }
    }

    // Elements adjacent to each variable, in insertion order.
    let mut var_elems: Vec<Vec<i32>> = vec![Vec::new(); n];
    // Member variables of each live element, ascending, in one arena.
    let mut elem_start = vec![0usize; n];
    let mut elem_len = vec![0usize; n];
    let mut arena: Vec<i32> = Vec::with_capacity(16usize.max(raw.len()));

    // ---- Degree buckets: doubly linked lists, head insertion. ----
    let mut head = vec![-1i32; n];
    let mut next = vec![-1i32; n];
    let mut prev = vec![-1i32; n];
    fn insert(head: &mut [i32], next: &mut [i32], prev: &mut [i32], i: usize, d: usize) {
        let h = head[d];
        next[i] = h;
        prev[i] = -1;
        if h != -1 {
            prev[h as usize] = i as i32;
        }
        head[d] = i as i32;
    }
    fn remove(head: &mut [i32], next: &mut [i32], prev: &mut [i32], i: usize, d: usize) {
        if prev[i] != -1 {
            next[prev[i] as usize] = next[i];
        } else {
            head[d] = next[i];
        }
        if next[i] != -1 {
            prev[next[i] as usize] = prev[i];
        }
    }
    for i in (0..n).rev() {
        if status[i] == LIVE_VAR {
            insert(&mut head, &mut next, &mut prev, i, degree[i]);
        }
    }

    let mut w = vec![0i64; n];
    let mut w_mark = vec![-1i32; n];
    mark.fill(-1);

    let mut min_degree = 0usize;
    let mut k = 0usize;
    let mut live = n - dense_count;
    let mut lp = vec![0i32; n];

    while live > 0 {
        // ---- Select the minimum-degree variable. ----
        while head[min_degree] == -1 {
            min_degree += 1;
        }
        let p = head[min_degree] as usize;
        remove(&mut head, &mut next, &mut prev, p, min_degree);
        order[k] = p as i32;
        k += 1;
        live -= 1;
        status[p] = LIVE_ELEM;

        // ---- Lₚ = (Aₚ ∪ ⋃ Lₑ for e ∈ Eₚ) \ {p}; absorb every e ∈ Eₚ. ----
        let mut lp_len = 0;
        mark[p] = p as i32;
        let adj_start_p = start[p];
        let adj_end_p = adj_start_p + adj_len[p];
        for t in adj_start_p..adj_end_p {
            let v = raw[t] as usize;
            if status[v] == LIVE_VAR && mark[v] != p as i32 {
                mark[v] = p as i32;
                lp[lp_len] = v as i32;
                lp_len += 1;
            }
        }
        let elems_p = std::mem::take(&mut var_elems[p]);
        for &e in &elems_p {
            let e = e as usize;
            if status[e] != LIVE_ELEM {
                continue;
            }
            let es = elem_start[e];
            let ee = es + elem_len[e];
            for s in es..ee {
                let v = arena[s] as usize;
                if status[v] == LIVE_VAR && mark[v] != p as i32 {
                    mark[v] = p as i32;
                    lp[lp_len] = v as i32;
                    lp_len += 1;
                }
            }
            status[e] = DEAD;
        }
        adj_len[p] = 0;

        // Element p's members, ascending, appended to the arena.
        let lp_start = arena.len();
        arena.extend_from_slice(&lp[..lp_len]);
        arena[lp_start..lp_start + lp_len].sort_unstable();
        elem_start[p] = lp_start;
        elem_len[p] = lp_len;

        // ---- w[e] = |Lₑ \ Lₚ| for every live element adjacent to Lₚ. ----
        for &v in &lp[..lp_len] {
            for &e in &var_elems[v as usize] {
                let e = e as usize;
                if status[e] != LIVE_ELEM {
                    continue;
                }
                if w_mark[e] != p as i32 {
                    w_mark[e] = p as i32;
                    w[e] = elem_len[e] as i64;
                }
                w[e] -= 1;
            }
        }

        // ---- Update the quotient graph and approximate degrees of Lₚ. ----
        for t in (lp_start..lp_start + lp_len).rev() {
            let i = arena[t] as usize;
            let old_degree = degree[i];
            remove(&mut head, &mut next, &mut prev, i, old_degree);

            let elems = &mut var_elems[i];
            let mut kept = 0;
            let mut d: i64 = lp_len as i64 - 1;
            for s in 0..elems.len() {
                let e = elems[s] as usize;
                if status[e] != LIVE_ELEM {
                    continue;
                }
                if w[e] == 0 {
                    // Lₑ ⊆ Lₚ: aggressive absorption into the new element.
                    status[e] = DEAD;
                    continue;
                }
                d += w[e];
                elems[kept] = e as i32;
                kept += 1;
            }
            elems.truncate(kept);
            elems.push(p as i32);

            // Variables covered by Lₚ are now reached through element p.
            let s0 = start[i];
            let end = s0 + adj_len[i];
            let mut len = 0;
            for s in s0..end {
                let v = raw[s];
                if status[v as usize] == LIVE_VAR && mark[v as usize] != p as i32 {
                    raw[s0 + len] = v;
                    len += 1;
                }
            }
            adj_len[i] = len;
            d += len as i64;

            d = d
                .min(live as i64 - 1)
                .min(old_degree as i64 + lp_len as i64 - 1);
            if d < 0 {
                d = 0;
            }
            let d = d as usize;
            degree[i] = d;
            insert(&mut head, &mut next, &mut prev, i, d);
            if d < min_degree {
                min_degree = d;
            }
        }
    }

    // ---- Dense rows go last, in ascending index order. ----
    for i in 0..n {
        if status[i] == DENSE {
            order[k] = i as i32;
            k += 1;
        }
    }
    order
}
