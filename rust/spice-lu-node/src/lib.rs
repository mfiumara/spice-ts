//! napi-rs binding for the issue #802 spike. Typed arrays are borrowed
//! zero-copy from V8 (`Int32Array` / `Float64Array` deref to Rust slices), and
//! `solve` overwrites the caller's Float64Array in place, like the TS solver.

use napi::bindgen_prelude::{Float64Array, Int32Array};
use napi::{Error, Result, Status};
use napi_derive::napi;
use spice_lu::{GilbertPeierls, Ordering};

#[napi]
pub struct RustLu {
    inner: GilbertPeierls,
}

fn singular(column: usize) -> Error {
    Error::new(
        Status::GenericFailure,
        format!("singular matrix at column {column}"),
    )
}

#[napi]
impl RustLu {
    #[napi(constructor)]
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        RustLu {
            inner: GilbertPeierls::new(),
        }
    }

    /// Symbolic analysis (AMD + column singletons) of an n x n CSC pattern.
    #[napi]
    pub fn analyze(&mut self, col_ptr: Int32Array, row_idx: Int32Array) {
        let n = col_ptr.len() - 1;
        self.inner
            .analyze_pattern(n, &col_ptr, &row_idx, Ordering::Amd);
    }

    /// Numeric factorization (pivot reuse first, like the TS solver).
    #[napi]
    pub fn factorize(&mut self, values: Float64Array) -> Result<()> {
        self.inner
            .factorize(&values)
            .map_err(|e| singular(e.column))
    }

    /// Solve in place: `b` is overwritten with x.
    #[napi]
    pub fn solve(&mut self, mut b: Float64Array) -> Result<()> {
        self.inner.solve(&mut b).map_err(|e| singular(e.column))
    }

    #[napi(getter)]
    pub fn refactor_count(&self) -> u32 {
        self.inner.refactor_count as u32
    }

    #[napi(getter)]
    pub fn factor_nonzeros(&self) -> u32 {
        self.inner.factor_nonzeros() as u32
    }

    #[napi(getter)]
    pub fn heap_bytes(&self) -> f64 {
        self.inner.heap_bytes() as f64
    }

    /// Release the factor storage now. V8 does not see native allocations, so
    /// relying on GC finalization alone lets dropped solvers pile up.
    #[napi]
    pub fn dispose(&mut self) {
        self.inner = GilbertPeierls::new();
    }

    #[napi]
    pub fn col_perm(&self) -> Int32Array {
        Int32Array::new(self.inner.col_perm().to_vec())
    }
}

/// Marshalling probe: crosses the boundary with the same arguments as
/// `factorize` and does no work, to isolate the call + borrow cost.
#[napi]
pub fn marshal_probe(values: Float64Array) -> f64 {
    values.first().copied().unwrap_or(0.0)
}
