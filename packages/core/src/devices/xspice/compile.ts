import { InvalidCircuitError } from '../../errors.js';
import type { XspiceInstanceCard, XspiceModelCard } from '../../parser/xspice-parser.js';
import type { DeviceModel } from '../device.js';
import { resolveXspiceConnections, resolveXspiceParams, type XspiceConnection } from './connections.js';
import { XSPICE_BEHAVIORS } from './models.js';
import { XSPICE_CODE_MODEL_SPECS, type XspiceParamValue } from './spec.js';
import { XspiceDevice, type XspiceInputPort, type XspiceOutputPort } from './xspice-device.js';

/** An A instance whose connections and parameters were resolved against its code model. */
export interface PreparedXspiceInstance {
  readonly card: XspiceInstanceCard;
  readonly model: XspiceModelCard;
  readonly connections: readonly XspiceConnection[];
  readonly params: ReadonlyMap<string, readonly XspiceParamValue[]>;
  /** Circuit nodes the instance connects to, in connection order. */
  readonly nodes: readonly string[];
}

/**
 * Resolve an A-card against its `.model` card.
 *
 * @throws {@link InvalidCircuitError} for an unknown or non-XSPICE model, malformed connections or parameters
 */
export function prepareXspiceInstance(
  card: XspiceInstanceCard,
  model: XspiceModelCard | undefined,
  isOtherModel: boolean,
  ground: string,
): PreparedXspiceInstance {
  if (!model) {
    throw new InvalidCircuitError(isOtherModel
      ? `XSPICE instance '${card.name}' references model '${card.modelName}', which is not an XSPICE code model`
      : `XSPICE instance '${card.name}' references unknown model '${card.modelName}'`);
  }
  const spec = XSPICE_CODE_MODEL_SPECS.get(model.codeModel)!;
  const connections = resolveXspiceConnections(card, spec, ground);
  const params = resolveXspiceParams(card.name, model, spec, connections);
  const nodes: string[] = [];
  for (const connection of connections) {
    for (const port of connection.ports) {
      if (port.positive !== undefined) nodes.push(port.positive);
      if (port.negative !== undefined) nodes.push(port.negative);
    }
  }
  return { card, model, connections, params, nodes };
}

/** Build the device, allocating a branch per voltage output and per current input. */
export function createXspiceDevice(
  prepared: PreparedXspiceInstance,
  resolveNode: (name: string) => number,
  allocateBranch: (name: string) => number,
): XspiceDevice {
  const { card, model, connections, params } = prepared;
  const inputs: XspiceInputPort[] = [];
  const outputs: XspiceOutputPort[] = [];
  connections.forEach((connection, c) => {
    connection.ports.forEach((port, p) => {
      const positive = port.positive === undefined ? -1 : resolveNode(port.positive);
      const negative = port.negative === undefined ? -1 : resolveNode(port.negative);
      if (connection.direction !== 'out') {
        if (port.type === 'vnam') {
          inputs.push({ kind: 'current', positive: -1, negative: -1, source: port.source! });
        } else if (port.type === 'i' || port.type === 'id') {
          const branch = allocateBranch(`${card.name}#ibranch_${c}_${p}`);
          inputs.push({ kind: 'current', positive, negative, ownBranch: branch, branch });
        } else {
          inputs.push({ kind: 'voltage', positive, negative });
        }
      }
      if (connection.direction !== 'in') {
        if (port.type === 'v' || port.type === 'vd') {
          outputs.push({ kind: 'voltage', positive, negative, branch: allocateBranch(`${card.name}#branch_${c}_${p}`) });
        } else {
          outputs.push({ kind: 'current', positive, negative });
        }
      }
    });
  });
  const behavior = XSPICE_BEHAVIORS.get(model.codeModel)!(params);
  return new XspiceDevice(card.name, model.codeModel, inputs, outputs, behavior, model.warnings);
}

/** Bind every `%vnam` input to the branch of its controlling voltage source. */
export function bindXspiceSources(devices: readonly DeviceModel[], deviceMap: ReadonlyMap<string, DeviceModel>): void {
  for (const device of devices) {
    if (!(device instanceof XspiceDevice)) continue;
    for (const { port, source } of device.unresolvedSources) {
      const controlling = [...deviceMap.entries()].find(([name]) => name.toUpperCase() === source.toUpperCase())?.[1];
      if (!controlling || controlling.branches.length === 0 || !/^v/i.test(source)) {
        throw new InvalidCircuitError(`${device.name}: unknown controlling source ${source}`);
      }
      device.bindSourceBranch(port, controlling.branches[0]);
    }
  }
}

/**
 * Reject analyses whose results the implemented code models cannot honour,
 * instead of simulating them silently wrong.
 */
export function assertXspiceAnalyses(
  instances: readonly PreparedXspiceInstance[],
  analyses: readonly string[],
): void {
  if (instances.length === 0) return;
  if (analyses.includes('disto')) {
    throw new InvalidCircuitError('XSPICE A devices do not support .disto (no distortion terms)');
  }
  for (const instance of instances) {
    const { codeModel } = instance.model;
    if (codeModel === 'int') {
      const unsupported = analyses.find(analysis => analysis === 'tf' || analysis === 'pz' || analysis === 'sens');
      if (unsupported) {
        throw new InvalidCircuitError(`XSPICE int instance '${instance.card.name}' does not support .${unsupported}`);
      }
      const currentOutput = instance.connections.some(connection =>
        connection.direction === 'out' && connection.ports.some(port => port.type === 'i' || port.type === 'id'));
      if (currentOutput && (analyses.includes('ac') || analyses.includes('noise'))) {
        throw new InvalidCircuitError(
          `XSPICE int instance '${instance.card.name}' does not support a current output in .${analyses.includes('ac') ? 'ac' : 'noise'}`,
        );
      }
    }
    if (codeModel === 'gain' && analyses.includes('noise')) {
      const noisy = ['noise_voltage', 'noise_current']
        .some(name => (instance.params.get(name)?.[0] as number | undefined) !== 0);
      if (noisy) {
        throw new InvalidCircuitError(
          `XSPICE gain instance '${instance.card.name}' has noise_voltage/noise_current; gain noise sources are not supported in .noise`,
        );
      }
    }
  }
}
