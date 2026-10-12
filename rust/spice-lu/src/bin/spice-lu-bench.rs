//! Pure-Rust phase timing on the dumped MatrixMarket matrices (no Node, no
//! marshalling): the "language + algorithm" number for issue #802.
//!
//! Usage: spice-lu-bench <matrices-dir> <runs> <deck> [<deck> ...]
//! Prints one JSON object per deck with per-run samples (milliseconds).

#![allow(clippy::needless_range_loop)]

use spice_lu::mtx::{read_csc, read_vector};
use spice_lu::{GilbertPeierls, Ordering};
use std::time::Instant;

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1e3
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        eprintln!("usage: spice-lu-bench <matrices-dir> <runs> <deck>...");
        std::process::exit(2);
    }
    let dir = &args[1];
    let runs: usize = args[2].parse().expect("runs");
    for deck in &args[3..] {
        let a = read_csc(&format!("{dir}/{deck}.first.A.mtx")).expect("A");
        let mut b = read_vector(&format!("{dir}/{deck}.first.b.mtx")).expect("b");
        // All-zero OP RHS (RC ladder): same deterministic synthetic RHS as bench.ts.
        let synthetic = b.iter().all(|&v| v == 0.0);
        if synthetic {
            for (i, v) in b.iter_mut().enumerate() {
                *v = ((i * 7919) % 1000) as f64 / 1000.0 - 0.5;
            }
        }
        let r = read_csc(&format!("{dir}/{deck}.refactor.A.mtx")).expect("refactor A");
        let rp = read_csc(&format!("{dir}/{deck}.perturbed.A.mtx")).expect("perturbed A");
        assert_eq!(a.col_ptr, r.col_ptr);
        assert_eq!(a.row_idx, r.row_idx);
        let (mut sym, mut fac, mut refac, mut sol) = (vec![], vec![], vec![], vec![]);
        let mut refac_p = vec![];
        let mut reused = true;
        let mut reused_p = true;
        let mut x = b.clone();
        let mut lu_nnz = 0;
        let mut heap_bytes = 0;
        // One untimed warm-up run, then `runs` timed runs.
        for run in 0..=runs {
            let mut s = GilbertPeierls::new();
            let t = Instant::now();
            s.analyze_pattern(a.n, &a.col_ptr, &a.row_idx, Ordering::Amd);
            let t_sym = ms(t);
            let t = Instant::now();
            s.factorize(&a.values).expect("factorize");
            let t_fac = ms(t);
            x.copy_from_slice(&b);
            let t = Instant::now();
            s.solve(&mut x).expect("solve");
            let t_sol = ms(t);
            let before = s.refactor_count;
            let t = Instant::now();
            s.factorize(&r.values).expect("refactor");
            let t_ref = ms(t);
            reused &= s.refactor_count == before + 1;
            s.factorize(&a.values).expect("factorize");
            let before_p = s.refactor_count;
            let t = Instant::now();
            s.factorize(&rp.values).expect("perturbed refactor");
            let t_ref_p = ms(t);
            reused_p &= s.refactor_count == before_p + 1;
            lu_nnz = s.factor_nonzeros();
            heap_bytes = s.heap_bytes();
            if run > 0 {
                sym.push(t_sym);
                fac.push(t_fac);
                sol.push(t_sol);
                refac.push(t_ref);
                refac_p.push(t_ref_p);
            }
        }
        // Solution of the first system for the residual check.
        let mut s = GilbertPeierls::new();
        s.analyze_pattern(a.n, &a.col_ptr, &a.row_idx, Ordering::Amd);
        s.factorize(&a.values).unwrap();
        x.copy_from_slice(&b);
        s.solve(&mut x).unwrap();
        let mut ax = vec![0.0; a.n];
        for j in 0..a.n {
            for p in a.col_ptr[j] as usize..a.col_ptr[j + 1] as usize {
                ax[a.row_idx[p] as usize] += a.values[p] * x[j];
            }
        }
        let rn: f64 = ax
            .iter()
            .zip(&b)
            .map(|(u, v)| (u - v) * (u - v))
            .sum::<f64>()
            .sqrt();
        let bn: f64 = b.iter().map(|v| v * v).sum::<f64>().sqrt();
        let checksum: f64 = x.iter().sum();
        let fmt = |v: &[f64]| {
            v.iter()
                .map(|x| format!("{x:.6}"))
                .collect::<Vec<_>>()
                .join(",")
        };
        println!(
            "{{\"deck\":\"{deck}\",\"n\":{},\"nnz\":{},\"luNnz\":{lu_nnz},\"heapBytes\":{heap_bytes},\"refactorReusedPivots\":{reused},\"refactorPerturbedReusedPivots\":{reused_p},\"syntheticRhs\":{synthetic},\"relResidual\":{:e},\"xSum\":{:e},\"symbolicMs\":[{}],\"factorMs\":[{}],\"refactorMs\":[{}],\"refactorPerturbedMs\":[{}],\"solveMs\":[{}]}}",
            a.n,
            a.col_ptr[a.n],
            rn / bn,
            checksum,
            fmt(&sym),
            fmt(&fac),
            fmt(&refac),
            fmt(&refac_p),
            fmt(&sol)
        );
    }
}
