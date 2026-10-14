/**
 * ngspice-47 handling of Xyce `.options <PACKAGE> field=value ...` cards (#713).
 *
 * ngspice has no option packages. inp.c turns every `.options` line into
 * front-end variables with cp_setparse(): a bare word becomes a boolean
 * variable and `name=value` a numeric/string one. inp_dodeck() then hands each
 * variable to if_option() (spiceif.c), which applies the names found in the
 * analysis-options table (cktsopt.c OPTtbl) and silently returns for every
 * other name. The package keyword (DEVICE, NONLIN, TIMEINT, ...) and Xyce-only
 * fields (MAXSTEP, VOLTLIM, NEWLTE, ...) therefore do nothing, while fields that
 * happen to be ngspice options (`.options device temp=27`,
 * `.options nonlin reltol=1e-2`) are applied exactly as on a plain `.options`
 * card. Names read elsewhere through cp_getvar(), or by substring scans of the
 * raw option lines in inp.c, are ngspice-meaningful too and are never ignored.
 */

/** Xyce Reference Guide `.OPTIONS` package names. */
const XYCE_OPTION_PACKAGES = new Set([
  'ac', 'const', 'device', 'diagnostic', 'embeddedsamples', 'hbint', 'linsol', 'linsol-ac',
  'linsol-hb', 'loca', 'measure', 'mpdeint', 'noise', 'nonlin', 'nonlin-hb', 'nonlin-tran',
  'nonlin-twolevel', 'nonlin-twolevel-tran', 'output', 'parser', 'pce', 'restart', 'samples',
  'sens', 'timeint', 'topology',
]);

/** ngspice-47 spicelib/analysis/cktsopt.c OPTtbl names.
 * KLU/SPARSE remain meaningful fields in package cards: the strict parser
 * records bare solver hints and rejects assigned forms, rather than ignoring them.
 */
const NGSPICE_ANALYSIS_OPTIONS = [
  'absdv', 'abstol', 'accept', 'acct', 'acfactortime', 'acloadtime', 'acsolvetime', 'acsynctime',
  'actime', 'autopartial', 'badmos3', 'bypass', 'chgtol', 'convabsstep', 'convlimit', 'convstep',
  'copynodesets', 'cptime', 'cshunt', 'defad', 'defas', 'defl', 'defm', 'defw', 'epsmin',
  'equations', 'factortime', 'fillinnz', 'gmin', 'gminfactor', 'gminsteps', 'gshunt',
  'indverbosity', 'itl1', 'itl2', 'itl3', 'itl4', 'itl5', 'itl6', 'keepopinfo', 'klu',
  'klu_memgrow_factor', 'limpts', 'limtim', 'list', 'loadtime', 'lteabstol', 'ltereltol',
  'ltetrtol', 'lvlcod', 'lvltim', 'maxevtiter', 'maxopalter', 'maxord', 'method', 'minbreak',
  'newtrunc', 'node', 'nodedamping', 'nomod', 'noopac', 'noopalter', 'noopiter', 'nopage',
  'numdgt', 'oldlimit', 'opts', 'originalnz', 'pivrel', 'pivtol', 'ramptime', 'rejected', 'reldv',
  'reltol', 'reordertime', 'rshunt', 'solvetime', 'sparse', 'srcsteps', 'synctime', 'temp', 'time',
  'tnom', 'totalnz', 'totiter', 'trancuriters', 'tranfactortime', 'traniter', 'tranloadtime',
  'tranpoints', 'transolvetime', 'transynctime', 'trantime', 'trantrunctime', 'trtol',
  'trytocompact', 'vntol', 'xmu',
];

/**
 * Every literal cp_getvar() name in the ngspice-47 sources, plus the if_option()
 * report flags and the inp.c option-line scans (seed, seedinfo, scalm,
 * savecurrents). Most only affect plotting or output, but a field that names
 * one is not "unknown to ngspice", so it is left to the strict option parser.
 */
const NGSPICE_FRONTEND_VARIABLES = [
  'acct', 'noacct', 'noinit', 'norefvalue', 'list', 'node', 'opts', 'nopage', 'nomod',
  'seed', 'seedinfo', 'scalm', 'savecurrents',
  'addcontrol', 'addescape', 'altshow', 'appendwrite', 'askquit', 'auto_bridge', 'autostop',
  'brief', 'controlswait', 'cshunt_value', 'csnumprec', 'device', 'diff_abstol', 'diff_reltol',
  'diff_vntol', 'diode_cj0', 'diode_rser', 'display', 'dpolydegree', 'dyngmin', 'editor',
  'enable_noisy_r', 'event_node_spacing', 'filetype', 'fourgridsize', 'fournosave',
  'gnuplot_terminal', 'gridsize', 'gridstyle', 'hcopydev', 'hcopydevtype', 'hcopyfont',
  'hcopyfontfamily', 'hcopyfontsize', 'hcopyheight', 'hcopypscolor', 'hcopypstxcolor',
  'hcopyscale', 'hcopywidth', 'height', 'helpboldfont', 'helpbuttonfont', 'helpbuttonstyle',
  'helpinitxpos', 'helpinitypos', 'helpitalicfont', 'helppath', 'helpregfont', 'helptitlefont',
  'histsubst', 'interactive', 'interp', 'level', 'lprplot5', 'lprps', 'maxwarns', 'measoutfile',
  'mingwpath', 'modelcard', 'modelline', 'moremode', 'mtimeavgwindow', 'nfreqs', 'ng_nomodcheck',
  'ngbehavior', 'no_auto_braces', 'no_auto_bridge_family', 'no_auto_gnd', 'no_mem_check',
  'no_spiceinit', 'no_spinit', 'noasciiplotvalue', 'nobreak', 'noisyxspice', 'nolegend',
  'nopadding', 'noparse', 'noprintscale', 'noquotesinoutput', 'nosighandling', 'nosort',
  'nostepsizelimit', 'nosubckt', 'notrnoise', 'nounits', 'nperiods', 'num_threads', 'plainlet',
  'plainplot', 'plainwrite', 'plot_auto_spacing', 'plothistory', 'plotstyle', 'pointchars',
  'pointstyle', 'polydegree', 'polysteps', 'printinfo', 'probe_alli_given', 'probe_alli_nox',
  'probe_is_given', 'ps_global_hash_table', 'ps_global_tmodels', 'ps_ports_and_pins',
  'ps_scan_gates_optimize', 'ps_tpz_delays', 'ps_udevice_exit', 'ps_udevice_msgs', 'ps_use_mntymx',
  'ps_with_inverters', 'ps_with_tri_inverters', 'pyplot_backend', 'pyplot_figsize',
  'pyplot_linewidth', 'pyplot_python', 'pyplot_style', 'pyplot_subplots', 'pyplot_terminal',
  'rawfile', 'remote_shell', 'renumber', 'rhost', 'rndseed', 'rprogram', 'sanelet', 'scale',
  'silent_fileio', 'sim_status', 'soacheck', 'sourcepath', 'spectrace', 'specwindow',
  'specwindoworder', 'spicepath', 'sqrnoise', 'statlocal', 'subend', 'subinvoke', 'substart',
  'svg_intopts', 'svg_stropts', 'ticchar', 'ticlist', 'ticmarks', 'warn', 'wfont', 'wfont_size',
  'width', 'wnflag', 'wr_onespace', 'wr_singlescale', 'wr_vecnames', 'x11lineararcs',
  'xbrushwidth', 'xfont', 'xfont_size', 'xgridwidth', 'xtrtol',
];

const NGSPICE_OPTION_NAMES = new Set([...NGSPICE_ANALYSIS_OPTIONS, ...NGSPICE_FRONTEND_VARIABLES]);

/**
 * inp.c eval_opt(), the SCALE/SCALM scan and inp_savecurrents() match these
 * with strstr() anywhere in a (lower-cased) option line, so a Xyce field that
 * merely contains one is still read by ngspice.
 */
const NGSPICE_OPTION_LINE_SUBSTRINGS = ['seed=', 'seedinfo', 'cshunt=', 'scale=', 'scalm=', 'savecurrents'];

export interface XyceOptionPackageSplit {
  /** Tokens ngspice-47 reads as options; parse them like a plain `.options` card. */
  readonly fields: string[];
  /** Structured parse warning describing what ngspice-47 ignores, for package cards only. */
  readonly warning?: string;
}

/**
 * Whether ngspice-47 reads this `.options` field (an OPTtbl name, a cp_getvar()
 * name or an option-line substring scan). Every other field is silently
 * ignored by ngspice-47 (#713, #790).
 */
export function isNgspiceOptionField(token: string): boolean {
  const lower = token.toLowerCase();
  const separator = lower.indexOf('=');
  const name = separator < 0 ? lower : lower.slice(0, separator);
  return NGSPICE_OPTION_NAMES.has(name)
    || NGSPICE_OPTION_LINE_SUBSTRINGS.some(fragment => lower.includes(fragment));
}

/**
 * Split the tokens after `.options` into the fields ngspice-47 applies and the
 * ones it ignores. Cards without a leading Xyce package keyword are returned
 * unchanged; the option parser ignores their unrecognised names with the same
 * isNgspiceOptionField() rule (#790).
 */
export function splitXyceOptionPackage(tokens: readonly string[]): XyceOptionPackageSplit {
  const packageName = tokens[0];
  if (packageName === undefined || !XYCE_OPTION_PACKAGES.has(packageName.toLowerCase())) {
    return { fields: [...tokens] };
  }

  const fields: string[] = [];
  const ignored: string[] = [];
  for (const token of tokens.slice(1)) {
    if (token === '(' || token === ')') continue;
    (isNgspiceOptionField(token) ? fields : ignored).push(token);
  }

  const label = packageName.toUpperCase();
  const parts = [`Xyce .options ${label} package: ngspice-47 ignores the package name`];
  if (ignored.length > 0) parts.push(`ignored option names it does not recognise: ${ignored.join(' ')}`);
  if (fields.length > 0) parts.push(`applied as ngspice options: ${fields.join(' ')}`);
  return { fields, warning: parts.join('; ') };
}
