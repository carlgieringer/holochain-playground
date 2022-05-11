import { Element } from '@holochain-open-dev/core-types';
import {
  derived,
  get,
  readable,
  Readable,
  Writable,
  writable,
} from 'svelte/store';
import {
  DumpFullStateResponse,
  CellId,
  AdminWebsocket,
  AgentPubKey,
  DhtOp,
  AnyDhtHash,
  NewEntryHeader,
} from '@holochain/client';
import {
  FullIntegrationStateDump,
} from '@holochain/client/lib/api/state-dump';
import merge from 'lodash-es/merge';
import isEqual from 'lodash-es/isEqual';
import {
  AGENT_PREFIX,
  CellMap,
  HoloHashMap,
} from '@holochain-playground/simulator';
import { Base64 } from 'js-base64';

import { CellStore, ConductorStore, PlaygroundStore } from './playground-store';
import { pollingStore } from './polling-store';
import { PlaygroundMode } from './mode';
import { cellChanges } from './utils';

export class ConnectedCellStore extends CellStore<PlaygroundMode.Connected> {
  _state: Readable<DumpFullStateResponse | undefined>;

  sourceChain: Readable<Element[]>;
  peers: Readable<AgentPubKey[]>;
  dhtShard: Readable<Array<DhtOp>>;

  constructor(
    conductorStore: ConnectedConductorStore,
    public cellId: CellId,
    adminWs: AdminWebsocket
  ) {
    super(conductorStore);
    this._state = pollingStore(undefined, async (currentState) => {
      const fullState = await adminWs.dumpFullState({
        cell_id: cellId,
        dht_ops_cursor: currentState
          ? currentState.integration_dump.dht_ops_cursor
          : undefined,
      });
      const currentIntegration: FullIntegrationStateDump | undefined =
        currentState?.integration_dump;

      const integration_dump: FullIntegrationStateDump = {
        dht_ops_cursor: fullState.integration_dump.dht_ops_cursor,
        integrated: currentState
          ? [
              ...currentIntegration.integrated,
              ...fullState.integration_dump.integrated,
            ]
          : fullState.integration_dump.integrated,
        validation_limbo: currentState
          ? [
              ...currentIntegration.validation_limbo,
              ...fullState.integration_dump.validation_limbo,
            ]
          : fullState.integration_dump.validation_limbo,
        integration_limbo: currentState
          ? [
              ...currentIntegration.integration_limbo,
              ...fullState.integration_dump.integration_limbo,
            ]
          : fullState.integration_dump.integration_limbo,
      };

      return {
        ...fullState,
        integration_dump,
      };
    });

    this.sourceChain = derived(this._state, (s) =>
      s
        ? s.source_chain_dump.elements.map((e) => ({
            signed_header: {
              header: {
                content: e.header,
                hash: e.header_address,
              },
              signature: e.signature,
            },
            entry: e.entry,
          }))
        : []
    );
    this.peers = derived(this._state, (s) =>
      s
        ? s.peer_dump.peers.map(
            (peerDump) =>
              new Uint8Array([
                ...Base64.toUint8Array(AGENT_PREFIX),
                ...peerDump.kitsune_agent,
              ])
          )
        : []
    );
    this.dhtShard = derived(this._state, (s) =>
      s ? s.integration_dump.integrated : []
    );
  }
}

export class ConnectedConductorStore extends ConductorStore<PlaygroundMode.Connected> {
  cells: Readable<CellMap<ConnectedCellStore>>;

  constructor(protected adminWs: AdminWebsocket) {
    super();

    this.cells = pollingStore(
      new CellMap<ConnectedCellStore>(),
      async (currentCells) => {
        const cellIds = await adminWs.listCellIds();

        const { cellsToAdd, cellsToRemove } = cellChanges(
          currentCells.cellIds(),
          cellIds
        );

        for (const cellId of cellsToAdd) {
          currentCells.put(
            cellId,
            new ConnectedCellStore(this, cellId, adminWs)
          );
        }

        for (const cellId of cellsToRemove) {
          if (!cellIds.find((c) => isEqual(c, cellId))) {
            currentCells.delete(cellId);
          }
        }

        return currentCells;
      }
    );
  }

  get url() {
    return this.adminWs.client.socket.url;
  }
}

export class ConnectedPlaygroundStore extends PlaygroundStore<PlaygroundMode.Connected> {
  conductors: Writable<ConnectedConductorStore[]>;

  private constructor() {
    super();
    this.conductors = writable([]);
  }

  static async create(urls: string[]): Promise<ConnectedPlaygroundStore> {
    const store = new ConnectedPlaygroundStore();
    await store.setConductors(urls);
    return store;
  }

  async setConductors(urls: string[]) {
    urls = urls.map((u) => normalizeUrl(u));

    const currentUrls = get(this.conductors).map((c) => c.url);

    const toAdd = urls.filter((u) => !currentUrls.includes(u));
    const toRemove = currentUrls.filter((u) => !urls.includes(u));

    const promises = toAdd.map(async (url) => {
      try {
        const ws = await AdminWebsocket.connect(url);
        return ws;
      } catch (e) {
        return false;
      }
    });
    const maybeAdminWss = await Promise.all(promises);
    const adminWss = maybeAdminWss.filter((ws) => !!ws) as AdminWebsocket[];

    if (toAdd.length > 0 || toRemove.length > 0) {
      this.conductors.update((conductors) => [
        ...conductors.filter((c) => !toRemove.includes(c.url)),
        ...adminWss.map((ws) => new ConnectedConductorStore(ws)),
      ]);
    }
  }
}

function normalizeUrl(url: string): string {
  if (url.endsWith('/')) return url;
  return `${url}/`;
}
