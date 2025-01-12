import { Dictionary } from '@holochain-open-dev/core-types';
import {
  AgentPubKey,
  CellId,
  DnaHash,
  HoloHash,
} from '@holochain/conductor-api';
import flatMap from 'lodash-es/flatMap';
import { hashToString } from './hash';

export class HoloHashMap<T> {
  _values: Dictionary<{ hash: HoloHash; value: T }> = {};

  constructor(initialEntries?: Array<[HoloHash, T]>) {
    if (initialEntries) {
      for (const [cellId, value] of initialEntries) {
        this.put(cellId, value);
      }
    }
  }

  has(key: HoloHash): boolean {
    return !!this._values[this.stringify(key)];
  }

  get(key: HoloHash): T {
    return this._values[this.stringify(key)]?.value;
  }

  put(key: HoloHash, value: T) {
    this._values[this.stringify(key)] = {
      hash: key,
      value,
    };
  }

  delete(key: HoloHash) {
    const str = this.stringify(key);
    if (this._values[str]) {
      this._values[str] = undefined as any;
      delete this._values[str];
    }
  }

  keys() {
    return Object.values(this._values).map(v => v.hash);
  }

  values(): T[] {
    return Object.values(this._values).map(v => v.value);
  }

  entries(): Array<[HoloHash, T]> {
    return Object.entries(this._values).map(([key, value]) => [
      value.hash,
      value.value,
    ]);
  }

  private stringify(hash: Uint8Array): string {
    // We remove the first two bytes to be able to compare the hashes
    // of different types (Entry and Agents) and be them return the same
    return hashToString(hash);
  }
}

export class CellMap<T> {
  // Segmented by DnaHash / AgentPubKey
  #cellMap: HoloHashMap<HoloHashMap<T>> = new HoloHashMap();

  constructor(initialEntries?: Array<[CellId, T]>) {
    if (initialEntries) {
      for (const [cellId, value] of initialEntries) {
        this.put(cellId, value);
      }
    }
  }

  get([dnaHash, agentPubKey]: CellId): T | undefined {
    return this.#cellMap.get(dnaHash)
      ? this.#cellMap.get(dnaHash).get(agentPubKey)
      : undefined;
  }

  has(cellId: CellId): boolean {
    return !!this.get(cellId);
  }

  valuesForDna(dnaHash: DnaHash): Array<T> {
    const dnaMap = this.#cellMap.get(dnaHash);
    return dnaMap ? dnaMap.values() : [];
  }

  agentsForDna(dnaHash: DnaHash): Array<AgentPubKey> {
    const dnaMap = this.#cellMap.get(dnaHash);
    return dnaMap ? dnaMap.keys() : [];
  }

  put([dnaHash, agentPubKey]: CellId, value: T) {
    if (!this.#cellMap.get(dnaHash))
      this.#cellMap.put(dnaHash, new HoloHashMap());
    this.#cellMap.get(dnaHash).put(agentPubKey, value);
  }

  delete([dnaHash, agentPubKey]: CellId) {
    if (this.#cellMap.get(dnaHash)) {
      this.#cellMap.get(dnaHash).delete(agentPubKey);

      if (this.#cellMap.get(dnaHash).keys().length === 0) {
        this.#cellMap.delete(dnaHash);
      }
    }
  }

  entries(): Array<[CellId, T]> {
    return this.cellIds().map(
      cellId => [cellId, this.get(cellId)] as [CellId, T]
    );
  }

  filter(fn: (value: T) => boolean): CellMap<T> {
    const entries = this.entries();

    const mappedValues = entries.filter(([id, v]) => fn(v));

    return new CellMap(mappedValues);
  }

  map<R>(fn: (value: T) => R): CellMap<R> {
    const entries = this.entries();

    const mappedValues = entries.map(([id, v]) => [id, fn(v)] as [CellId, R]);

    return new CellMap(mappedValues);
  }

  values(): Array<T> {
    return this.cellIds().map(cellId => this.get(cellId) as T);
  }

  cellIds(): Array<CellId> {
    const dnaHashes = this.#cellMap.keys();

    return flatMap(dnaHashes, dnaHash =>
      this.#cellMap
        .get(dnaHash)
        .keys()
        .map(agentPubKey => [dnaHash, agentPubKey] as CellId)
    );
  }
}
