import { useEffect, useRef, useState } from "react";
import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { create } from "@bufbuild/protobuf";
import {
  GetOperationsRequestSchema,
  GetSnapshotChangesResponse,
} from "../../../gen/ts/v1/service_pb";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import { getOperations } from "../../api/oplog";
import { alerts, formatErrorAlert } from "../../components/common/Alerts";
import { MAX_OPERATION_HISTORY } from "../../constants";
import { formatBytes, formatTime } from "../../lib/formatting";
import * as m from "../../paraglide/messages";
import {
  GrowthRow,
  buildGrowthRows,
  rowCost,
  summarizeGrowth,
} from "./repoGrowth";
import { SnapshotChanges } from "./SnapshotChanges";

const GROWTH_ROWS = 30;

const Row = ({
  row,
  max,
  open,
  onToggle,
}: {
  row: GrowthRow;
  max: number;
  open: boolean;
  onToggle: () => void;
}) => {
  const cost = rowCost(row);
  return (
    <Flex
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={m.repo_growth_row_open()}
      cursor="pointer"
      align="center"
      gap={3}
      borderRadius="md"
      _hover={{ bg: "bg.muted" }}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      title={m.repo_growth_row_title({
        added: formatBytes(row.added),
        stored: row.stored === undefined ? "n/a" : formatBytes(row.stored),
        source: formatBytes(row.source),
      })}
    >
      <Box flex="0 0 auto" color="fg.muted">
        {open ? <FiChevronDown /> : <FiChevronRight />}
      </Box>
      <Box flex="0 0 auto" minW="9.5rem">
        <Text fontSize="sm">{formatTime(row.timeMs)}</Text>
        <Text fontSize="xs" color="fg.muted">
          {row.host}
          {row.plan ? ` · ${row.plan}` : ""}
        </Text>
      </Box>
      <Box flex="1 1 0" minW={0} h={2} borderRadius="full" bg="bg.muted">
        <Box
          h="100%"
          borderRadius="full"
          bg="green.solid"
          style={{ width: `${max > 0 ? (cost / max) * 100 : 0}%` }}
        />
      </Box>
      <Box flex="0 0 auto" minW="6.5rem" textAlign="right">
        <Text fontSize="sm" fontWeight="medium">
          {formatBytes(cost)}
        </Text>
        <Text fontSize="xs" color="fg.muted">
          {m.repo_growth_of({ size: formatBytes(row.source) })}
        </Text>
      </Box>
    </Flex>
  );
};

export const RepoGrowth = ({
  repoId,
  repoGuid,
}: {
  repoId: string;
  repoGuid: string;
}) => {
  const [rows, setRows] = useState<GrowthRow[] | null>(null);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  // comparing a snapshot with its parent lists the whole snapshot, keep what was already loaded
  const changesCache = useRef(new Map<string, GetSnapshotChangesResponse>());

  // Panels do not close each other: closing one above the clicked row would shift the page and
  // move the row out from under the pointer.
  const toggleOpen = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setOpenKeys(new Set());
    changesCache.current.clear();
    getOperations(
      create(GetOperationsRequestSchema, {
        selector: { repoGuid },
        lastN: BigInt(MAX_OPERATION_HISTORY),
      }),
    )
      .then((ops) => {
        if (!cancelled) setRows(buildGrowthRows(ops, GROWTH_ROWS));
      })
      .catch((e) => {
        alerts.error(formatErrorAlert(e, m.repo_growth_failed()));
      });
    return () => {
      cancelled = true;
    };
  }, [repoGuid]);

  if (rows === null) {
    return <Text color="fg.muted">{m.loading()}</Text>;
  }
  const summary = summarizeGrowth(rows);
  if (!summary) {
    return <Text color="fg.muted">{m.repo_growth_empty()}</Text>;
  }
  const max = rowCost(summary.largest);

  return (
    <Stack gap={3}>
      <Text fontSize="sm">
        {m.repo_growth_summary({
          count: String(rows.length),
          total: formatBytes(summary.total),
          average: formatBytes(summary.average),
          largest: formatBytes(max),
          date: formatTime(summary.largest.timeMs),
        })}
      </Text>
      <Text fontSize="xs" color="fg.muted">
        {m.repo_growth_hint()}
      </Text>
      <Stack gap={2}>
        {rows.map((row) => (
          <Box key={row.key}>
            <Row
              row={row}
              max={max}
              open={openKeys.has(row.key)}
              onToggle={() => toggleOpen(row.key)}
            />
            {openKeys.has(row.key) && (
              <Box mt={2} ml={7} p={3} borderRadius="md" bg="bg.subtle">
                <SnapshotChanges
                  repoId={repoId}
                  snapshotId={row.key}
                  parentId={row.parent || undefined}
                  cache={changesCache.current}
                />
              </Box>
            )}
          </Box>
        ))}
      </Stack>
    </Stack>
  );
};
