/*
 * Reference harness for the spice-ts port of ngspice-47 f_alpha (FFTW build).
 *
 * The body of f_alpha_fftw() is ngspice-47 src/frontend/trannoise/1-f-code.c
 * f_alpha(), HAVE_LIBFFTW3 branch, copied verbatim except that the white-noise
 * draws `Q_d * GaussWa` are replaced by `Q_d * white[i]` read from stdin, so the
 * two implementations can be compared on identical input. The product loop
 * keeps ngspice-47's indexing (hfa[i], hfa[i+1] on the interleaved r2c output).
 *
 * The f_alpha body is ngspice code (Copyright: Holger Vogt, 2008), BSD-3-Clause
 * like the rest of ngspice. FFTW is only linked by this local reference build.
 *
 * Build: cc -O2 f-alpha-ref.c -I/opt/homebrew/opt/fftw/include \
 *          -L/opt/homebrew/opt/fftw/lib -lfftw3 -lm -o f-alpha-ref
 * Input (stdin): n_pts Q_d alpha, then n_pts white-noise values.
 * Output (stdout): n_pts values of X, one per line, %.17g.
 */
#include <stdio.h>
#include <stdlib.h>
#include <fftw3.h>

static void f_alpha_fftw(int n_pts, double X[], double Q_d, double alpha, const double white[])
{
    int i, length;
    double ha;
    double *hfa, *wfa;
    fftw_complex *out = NULL;
    fftw_plan plan_forward = NULL;
    fftw_plan plan_backward = NULL;

    ha = alpha/2.0;
    length = n_pts + 2;
    hfa = malloc(sizeof(double) * (size_t) length);
    wfa = malloc(sizeof(double) * (size_t) length);

    hfa[0] = 1.0;
    wfa[0] = Q_d * white[0];
    for (i = 1; i < n_pts; i++) {
        hfa[i] = hfa[i-1] * (ha + (double)(i-1)) / ((double)(i));
        wfa[i] = Q_d * white[i];
    }

    hfa[n_pts] = 0.0;
    wfa[n_pts] = 0.0;
    hfa[n_pts+1] = 0.0;
    wfa[n_pts+1] = 0.0;

    plan_forward = fftw_plan_dft_r2c_1d(n_pts, hfa, (fftw_complex *)hfa, FFTW_ESTIMATE);
    fftw_execute(plan_forward);
    fftw_destroy_plan(plan_forward);

    plan_forward = fftw_plan_dft_r2c_1d(n_pts, wfa, (fftw_complex *)wfa, FFTW_ESTIMATE);
    fftw_execute(plan_forward);
    fftw_destroy_plan(plan_forward);

    out = fftw_malloc(sizeof(fftw_complex) * (unsigned int) (n_pts/2 + 1));
    for (i = 0; i < n_pts/2 + 1; i++) {
        out[i][0] = hfa[i]*wfa[i] - hfa[i+1]*wfa[i+1];
        out[i][1] = hfa[i]*wfa[i+1] + hfa[i+1]*wfa[i];
    }

    plan_backward = fftw_plan_dft_c2r_1d(n_pts, out, X, FFTW_ESTIMATE);
    fftw_execute(plan_backward);
    fftw_destroy_plan(plan_backward);

    for (i = 0; i < n_pts; i++) {
        X[i] = X[i] / (double) n_pts;
    }

    fftw_free(out);
    free(hfa);
    free(wfa);
}

int main(void)
{
    int n, i;
    double q, alpha;
    if (scanf("%d %lf %lf", &n, &q, &alpha) != 3 || n < 1) return 1;
    double *white = malloc(sizeof(double) * (size_t) n);
    double *X = malloc(sizeof(double) * (size_t) n);
    for (i = 0; i < n; i++)
        if (scanf("%lf", &white[i]) != 1) return 1;
    f_alpha_fftw(n, X, q, alpha, white);
    for (i = 0; i < n; i++) printf("%.17g\n", X[i]);
    free(white);
    free(X);
    return 0;
}
