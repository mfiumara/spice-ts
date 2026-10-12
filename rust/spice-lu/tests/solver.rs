use spice_lu::{GilbertPeierls, Ordering, Singular};

/// Dense row-major -> CSC (explicit entries only where `pattern` is true).
fn csc(n: usize, dense: &[f64]) -> (Vec<i32>, Vec<i32>, Vec<f64>) {
    let (mut cp, mut ri, mut v) = (vec![0i32], vec![], vec![]);
    for j in 0..n {
        for i in 0..n {
            let a = dense[i * n + j];
            if a != 0.0 {
                ri.push(i as i32);
                v.push(a);
            }
        }
        cp.push(ri.len() as i32);
    }
    (cp, ri, v)
}

fn residual(n: usize, cp: &[i32], ri: &[i32], v: &[f64], x: &[f64], b: &[f64]) -> f64 {
    let mut ax = vec![0.0; n];
    for j in 0..n {
        for p in cp[j] as usize..cp[j + 1] as usize {
            ax[ri[p] as usize] += v[p] * x[j];
        }
    }
    let r: f64 = ax
        .iter()
        .zip(b)
        .map(|(a, b)| (a - b).powi(2))
        .sum::<f64>()
        .sqrt();
    let bn: f64 = b.iter().map(|b| b * b).sum::<f64>().sqrt();
    r / bn
}

fn solve(n: usize, dense: &[f64], b: &[f64]) -> Result<Vec<f64>, Singular> {
    let (cp, ri, v) = csc(n, dense);
    let mut s = GilbertPeierls::new();
    s.analyze_pattern(n, &cp, &ri, Ordering::Amd);
    s.factorize(&v)?;
    let mut x = b.to_vec();
    s.solve(&mut x)?;
    Ok(x)
}

#[test]
fn solves_small_system() {
    let a = [4.0, -1.0, 0.0, -1.0, 4.0, -1.0, 0.0, -1.0, 4.0];
    let b = [1.0, 2.0, 3.0];
    let x = solve(3, &a, &b).unwrap();
    let (cp, ri, v) = csc(3, &a);
    assert!(residual(3, &cp, &ri, &v, &x, &b) < 1e-15);
}

#[test]
fn pivots_off_a_zero_diagonal() {
    // MNA voltage-source style: zero diagonal on the branch row.
    let a = [0.0, 1.0, 1.0, 1e-3];
    let b = [1.0, 0.0];
    let x = solve(2, &a, &b).unwrap();
    assert!(
        (x[0] - (-1e-3)).abs() < 1e-15 && (x[1] - 1.0).abs() < 1e-15,
        "{x:?}"
    );
}

#[test]
fn reports_numerically_singular_matrix() {
    let a = [1.0, 2.0, 2.0, 4.0];
    assert!(solve(2, &a, &[1.0, 1.0]).is_err());
}

#[test]
fn reports_non_finite_solution_like_ts() {
    let a = [1e-300, 0.0, 0.0, 1.0];
    // 1e300 / 1e-300 overflows to Inf in the back substitution.
    assert!(solve(2, &a, &[1e300, 1.0]).is_err());
}

/// Deterministic pseudo-random generator (xorshift), no dependencies.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }
}

fn random_mna(n: usize, rng: &mut Rng) -> Vec<f64> {
    let mut a = vec![0.0; n * n];
    for i in 0..n {
        for _ in 0..3 {
            let j = (rng.next() * n as f64) as usize % n;
            if i != j {
                let g = 1.0 + rng.next();
                a[i * n + j] -= g;
                a[j * n + i] -= g;
                a[i * n + i] += g;
                a[j * n + j] += g;
            }
        }
        a[i * n + i] += 1e-3;
    }
    a
}

#[test]
fn refactor_reuses_pivots_and_matches_full_factorization_bitwise() {
    let mut rng = Rng(0x05ee_d802);
    for _ in 0..20 {
        let n = 40;
        let a = random_mna(n, &mut rng);
        let (cp, ri, v) = csc(n, &a);
        let v2: Vec<f64> = v.iter().map(|x| x * (1.0 + 1e-3 * rng.next())).collect();
        let b: Vec<f64> = (0..n).map(|_| rng.next() - 0.5).collect();

        let mut reuse = GilbertPeierls::new();
        reuse.analyze_pattern(n, &cp, &ri, Ordering::Amd);
        reuse.factorize(&v).unwrap();
        reuse.factorize(&v2).unwrap();
        assert_eq!(reuse.refactor_count, 1);
        let mut x_reuse = b.clone();
        reuse.solve(&mut x_reuse).unwrap();

        let mut fresh = GilbertPeierls::new();
        fresh.analyze_pattern(n, &cp, &ri, Ordering::Amd);
        fresh.factorize(&v2).unwrap();
        let mut x_fresh = b.clone();
        fresh.solve(&mut x_fresh).unwrap();

        let bits = |x: &[f64]| x.iter().map(|v| v.to_bits()).collect::<Vec<_>>();
        assert_eq!(bits(&x_reuse), bits(&x_fresh));
        assert!(residual(n, &cp, &ri, &v2, &x_fresh, &b) < 1e-12);
    }
}

#[test]
fn identical_input_skips_refactorization() {
    let a = [4.0, -1.0, -1.0, 4.0];
    let (cp, ri, v) = csc(2, &a);
    let mut s = GilbertPeierls::new();
    s.analyze_pattern(2, &cp, &ri, Ordering::Amd);
    s.factorize(&v).unwrap();
    s.factorize(&v).unwrap();
    assert_eq!(s.numeric_count, 1);
}

#[test]
fn natural_and_amd_orderings_agree_numerically() {
    let mut rng = Rng(42);
    let n = 30;
    let a = random_mna(n, &mut rng);
    let (cp, ri, v) = csc(n, &a);
    let b: Vec<f64> = (0..n).map(|_| rng.next()).collect();
    let mut xs = vec![];
    for ord in [Ordering::Amd, Ordering::Natural] {
        let mut s = GilbertPeierls::new();
        s.analyze_pattern(n, &cp, &ri, ord);
        s.factorize(&v).unwrap();
        let mut x = b.clone();
        s.solve(&mut x).unwrap();
        xs.push(x);
    }
    for (p, q) in xs[0].iter().zip(&xs[1]) {
        assert!((p - q).abs() <= 1e-9 * p.abs().max(1.0));
    }
}
