//! spice-lu: issue #802 spike. A pure-Rust port of the spice-ts sparse LU
//! (`packages/core/src/solver/{amd-ordering,gilbert-peierls}.ts`), used only to
//! measure whether a Rust numeric core is worth a migration. Not wired into
//! @spice-ts/core.

// Index loops are kept on purpose: the port mirrors the TS loops one to one.
// Negated float comparisons are kept too: they carry the TS NaN semantics.
#![allow(clippy::needless_range_loop, clippy::neg_cmp_op_on_partial_ord)]

pub mod amd;
pub mod gp;
pub mod mtx;

pub use amd::amd_ordering;
pub use gp::{GilbertPeierls, Ordering, Singular};

/// Borrowed CSC sparsity pattern (0-based, `col_ptr.len() == n + 1`).
#[derive(Clone, Copy)]
pub struct CscPattern<'a> {
    pub n: usize,
    pub col_ptr: &'a [i32],
    pub row_idx: &'a [i32],
}
