/* ******************************************************************************
   *  BSIM4 4.8.3 released on 05/19/2025                                        *
   *  BSIM4 Model Equations                                                     *
   ******************************************************************************

   ******************************************************************************
   *  Copyright (c) 2025 University of California                               *
   *                                                                            *
   *  Project Directors: Prof. Sayeef Salahuddin and Prof. Chenming Hu          *
   *  Developers list: https://www.bsim.berkeley.edu/models/bsim4/auth_bsim4/   *
   ******************************************************************************/

/*
Licensed under Educational Community License, Version 2.0 (the "License"); you may
not use this file except in compliance with the License. You may obtain a copy of the license at
http://opensource.org/licenses/ECL-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations
under the License.

BSIM4 model is supported by the members of Silicon Integration Initiative's Compact Model Coalition. A link to the most recent version of this
standard can be found at: http://www.si2.org/cmc
*/

// Modified/ported to TypeScript by spice-ts: lowercase card-name schema and typed setup outputs.

export const INSTANCE_PARAMETER_NAMES = [
  'l', 'w', 'm', 'nf', 'sa', 'sb', 'sd', 'sca', 'scb', 'scc', 'sc', 'min',
  'ad', 'as', 'pd', 'ps', 'nrd', 'nrs', 'off', 'rbdb', 'rbsb', 'rbpb', 'rbps', 'rbpd',
  'delvto', 'mulu0', 'xgw', 'ngcon', 'wnflag', 'dtemp', 'trnqsmod', 'acnqsmod',
  'rbodymod', 'rgatemod', 'geomod', 'rgeomod', 'mult_i', 'mult_q', 'mult_fn',
  'icvgs', 'icvds', 'icvbs',
] as const;
export type Bsim4InstanceParameter = (typeof INSTANCE_PARAMETER_NAMES)[number];
export type Bsim4InstanceValues = Readonly<Record<Bsim4InstanceParameter, number>>;
export interface Bsim4ExternalNodes { readonly d: number; readonly g: number; readonly s: number; readonly b: number }
export interface Bsim4Nodes extends Bsim4ExternalNodes {
  readonly dp: number; readonly sp: number; readonly gp: number; readonly gm: number;
  readonly bp: number; readonly db: number; readonly sb: number;
  /** No NQS charge node in the static subset. Not ground. */
  readonly q: null;
}
