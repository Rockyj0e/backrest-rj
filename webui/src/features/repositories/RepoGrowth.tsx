import { useEffect, useState } from "react";
import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { create } from "@bufbuild/protobuf";
import { GetOperationsRequestSchema } from "../../../gen/ts/v1/service_pb";
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

const GROWTH_ROWS = 30;

const Row = ({ row, max }: { row: GrowthRow; max: number }) => {
  const cost = rowCost(row);
  return (
    <Flex
      align="center"
      gap={3}
      title={m.repo_growth_row_title({
        added: formatBytes(row.added),
        stored: row.stored === undefined ? "n/a" : formatBytes(row.stored),
        source: formatBytes(row.source),
      })}
    >
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

export const RepoGrowth = ({ repoGuid }: { repoGuid: string }) => {
  const [rows, setRows] = useState<GrowthRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
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
          <Row key={row.key} row={row} max={max} />
        ))}
      </Stack>
    </Stack>
  );
};
