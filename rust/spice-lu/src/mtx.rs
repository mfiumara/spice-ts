//! Minimal MatrixMarket reader for the matrices dumped by
//! `benchmarks/rust-lu-spike/dump-matrices.ts` (coordinate real general,
//! column-major, rows ascending per column; and dense `array` vectors).

use std::fs;
use std::io;

/// Owned CSC matrix.
pub struct Csc {
    pub n: usize,
    pub col_ptr: Vec<i32>,
    pub row_idx: Vec<i32>,
    pub values: Vec<f64>,
}

fn bad(msg: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, msg.to_string())
}

fn data_lines(text: &str) -> impl Iterator<Item = &str> {
    text.lines()
        .filter(|l| !l.starts_with('%') && !l.trim().is_empty())
}

pub fn read_csc(path: &str) -> io::Result<Csc> {
    let text = fs::read_to_string(path)?;
    let mut lines = data_lines(&text);
    let header: Vec<usize> = lines
        .next()
        .ok_or_else(|| bad("missing size line"))?
        .split_whitespace()
        .map(|t| t.parse().map_err(|_| bad("bad size")))
        .collect::<io::Result<_>>()?;
    let (n, nnz) = (header[0], header[2]);
    let mut entries: Vec<(usize, usize, f64)> = Vec::with_capacity(nnz);
    for line in lines {
        let mut it = line.split_whitespace();
        let i: usize = it
            .next()
            .and_then(|t| t.parse().ok())
            .ok_or_else(|| bad("row"))?;
        let j: usize = it
            .next()
            .and_then(|t| t.parse().ok())
            .ok_or_else(|| bad("col"))?;
        let v: f64 = it
            .next()
            .and_then(|t| t.parse().ok())
            .ok_or_else(|| bad("value"))?;
        entries.push((i - 1, j - 1, v));
    }
    if entries.len() != nnz {
        return Err(bad("nnz mismatch"));
    }
    entries.sort_by_key(|e| (e.1, e.0));
    let mut col_ptr = vec![0i32; n + 1];
    let mut row_idx = Vec::with_capacity(nnz);
    let mut values = Vec::with_capacity(nnz);
    for &(i, j, v) in &entries {
        col_ptr[j + 1] += 1;
        row_idx.push(i as i32);
        values.push(v);
    }
    for j in 0..n {
        col_ptr[j + 1] += col_ptr[j];
    }
    Ok(Csc {
        n,
        col_ptr,
        row_idx,
        values,
    })
}

pub fn read_vector(path: &str) -> io::Result<Vec<f64>> {
    let text = fs::read_to_string(path)?;
    let mut lines = data_lines(&text);
    lines.next().ok_or_else(|| bad("missing size line"))?;
    lines
        .map(|l| l.trim().parse::<f64>().map_err(|_| bad("value")))
        .collect()
}
