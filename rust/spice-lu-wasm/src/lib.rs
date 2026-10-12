//! wasm-bindgen binding for the issue #802 spike. Slices are the standard
//! wasm-bindgen marshalling: `&[T]` is copied into linear memory per call,
//! `&mut [f64]` is copied in and back out. The harness measures that cost
//! separately with `marshal_probe`.

use spice_lu::{GilbertPeierls, Ordering};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct RustLu {
    inner: GilbertPeierls,
}

fn singular(column: usize) -> JsError {
    JsError::new(&format!("singular matrix at column {column}"))
}

#[wasm_bindgen]
impl RustLu {
    #[wasm_bindgen(constructor)]
    pub fn new() -> RustLu {
        RustLu {
            inner: GilbertPeierls::new(),
        }
    }

    pub fn analyze(&mut self, col_ptr: &[i32], row_idx: &[i32]) {
        let n = col_ptr.len() - 1;
        self.inner
            .analyze_pattern(n, col_ptr, row_idx, Ordering::Amd);
    }

    pub fn factorize(&mut self, values: &[f64]) -> Result<(), JsError> {
        self.inner.factorize(values).map_err(|e| singular(e.column))
    }

    /// Solve in place: `b` is overwritten with x (copied back by the glue).
    pub fn solve(&mut self, b: &mut [f64]) -> Result<(), JsError> {
        self.inner.solve(b).map_err(|e| singular(e.column))
    }

    #[wasm_bindgen(getter, js_name = refactorCount)]
    pub fn refactor_count(&self) -> u32 {
        self.inner.refactor_count as u32
    }

    #[wasm_bindgen(getter, js_name = factorNonzeros)]
    pub fn factor_nonzeros(&self) -> u32 {
        self.inner.factor_nonzeros() as u32
    }

    #[wasm_bindgen(getter, js_name = heapBytes)]
    pub fn heap_bytes(&self) -> f64 {
        self.inner.heap_bytes() as f64
    }

    #[wasm_bindgen(js_name = colPerm)]
    pub fn col_perm(&self) -> Vec<i32> {
        self.inner.col_perm().to_vec()
    }
}

impl Default for RustLu {
    fn default() -> Self {
        Self::new()
    }
}

/// Marshalling probe: same argument as `factorize`, no work.
#[wasm_bindgen(js_name = marshalProbe)]
pub fn marshal_probe(values: &[f64]) -> f64 {
    values.first().copied().unwrap_or(0.0)
}

/// Current WebAssembly linear memory size in bytes (peak, since it never shrinks).
#[wasm_bindgen(js_name = linearMemoryBytes)]
pub fn linear_memory_bytes() -> f64 {
    (core::arch::wasm32::memory_size(0) * 65536) as f64
}
