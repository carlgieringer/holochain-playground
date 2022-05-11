import { Dictionary, serializeHash } from '@holochain-open-dev/core-types';
import {
  BadAgent,
  Cell,
  CellMap,
  hash,
  HashType,
  HoloHashMap,
  location,
} from '@holochain-playground/simulator';
import {
  AgentPubKey,
  CellId,
  DhtOp,
  DhtOpType,
  EntryHash,
  getDhtOpHeader,
  getDhtOpType,
  HeaderHash,
  NewEntryHeader,
} from '@holochain/client';
import isEqual from 'lodash-es/isEqual';
import { CellStore } from '../../store/playground-store';
import { SimulatedCellStore } from '../../store/simulated-playground-store';

export function dhtCellsNodes(
  cells: CellMap<CellStore<any>>,
  badAgents?: CellMap<BadAgent>
) {
  const sortedCells = cells
    .entries()
    .sort(
      (a: [CellId, CellStore<any>], b: [CellId, CellStore<any>]) =>
        location(a[0][1]) - location(b[0][1])
    );
  const cellNodes = sortedCells.map(([cellId, cellStore]) => {
    const simulated = cellStore instanceof SimulatedCellStore;
    const label = simulated
      ? `${(cellStore as SimulatedCellStore).conductorStore.name}${
          badAgents.has(cellId) ? '😈' : ''
        }`
      : `${serializeHash(cellId[1]).slice(0, 7)}...`;

    return {
      data: {
        id: serializeHash(cellId[1]),
        label,
      },
      classes: ['cell'],
    };
  });
  return cellNodes;
}

export function simulatedNeighbors(
  cells: CellMap<CellStore<any>>,
  peers: CellMap<AgentPubKey[]>,
  farPeers: CellMap<AgentPubKey[]>,
  badAgents: CellMap<AgentPubKey[]>
) {
  const normalEdges = allPeersEdges(cells, peers);

  // Add the far peers

  for (const [cellId, info] of farPeers.entries()) {
    for (const farPeer of info) {
      if (!doTheyHaveBeef(badAgents, cellId, farPeer)) {
        const pubKey = serializeHash(cellId[1]);
        normalEdges.push({
          data: {
            id: `${pubKey}->${serializeHash(farPeer)}`,
            source: pubKey,
            target: serializeHash(farPeer),
          },
          classes: ['far-neighbor-edge'],
        });
      }
    }
  }

  return normalEdges;
}

export function allPeersEdges(
  cells: CellMap<CellStore<any>>,
  cellsNeighbors: CellMap<Array<AgentPubKey>>
) {
  // Segmented by originAgentPubKey/targetAgentPubKey
  const visited: HoloHashMap<HoloHashMap<boolean>> = new HoloHashMap();
  const edges: Array<any> = [];

  const neighborsNotConnected = new CellMap<boolean>();

  for (const [cellId, neighbors] of cellsNeighbors.entries()) {
    const cellAgentPubKey = cellId[1];

    visited.put(cellAgentPubKey, new HoloHashMap());

    for (const cellNeighbor of neighbors) {
      if (
        !(
          visited.has(cellNeighbor) &&
          visited.get(cellNeighbor).has(cellAgentPubKey)
        )
      ) {
        edges.push({
          data: {
            id: `${serializeHash(cellAgentPubKey)}->${serializeHash(
              cellNeighbor
            )}`,
            source: serializeHash(cellAgentPubKey),
            target: serializeHash(cellNeighbor),
          },
          classes: ['neighbor-edge'],
        });

        if (!cells.has([cellId[0], cellNeighbor])) {
          neighborsNotConnected.put([cellId[0], cellNeighbor], true);
        }
      }

      visited.get(cellAgentPubKey).put(cellNeighbor, true);
    }
  }

  for (const [cellId, _] of neighborsNotConnected.entries()) {
    edges.push({
      data: {
        id: serializeHash(cellId[1]),
        label: `${serializeHash(cellId[1]).slice(0, 7)}... (Not Connected)`,
      },
      classes: ['not-held'],
    });
  }

  return edges;
}

function doTheyHaveBeef(
  badAgents: CellMap<AgentPubKey[]>,
  cellId1: CellId,
  agentPubKey: AgentPubKey
): boolean {
  const cellId2: CellId = [cellId1[0], agentPubKey];

  return (
    !!badAgents.get(cellId1).find((a) => isEqual(a, agentPubKey)) ||
    !!badAgents.get(cellId2).find((a) => isEqual(a, cellId1[1]))
  );
}

export function isHoldingEntry(dhtShard: DhtOp[], entryHash: EntryHash) {
  for (const dhtOp of dhtShard) {
    if (
      getDhtOpType(dhtOp) === DhtOpType.StoreEntry &&
      isEqual(entryHash, (getDhtOpHeader(dhtOp) as NewEntryHeader).entry_hash)
    ) {
      return true;
    }
  }

  return false;
}

export function isHoldingElement(dhtShard: DhtOp[], headerHash: HeaderHash) {
  for (const dhtOp of dhtShard) {
    const dhtOpheaderHash = hash(getDhtOpHeader(dhtOp), HashType.HEADER);
    if (
      getDhtOpType(dhtOp) === DhtOpType.StoreElement &&
      isEqual(dhtOpheaderHash, headerHash)
    ) {
      return true;
    }
  }

  return false;
}
