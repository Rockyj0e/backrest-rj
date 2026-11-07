import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { FiArrowDown } from "react-icons/fi";
import {
  SnapshotSavings,
  formatBytes,
  formatPercent,
  formatReductionRatio,
} from "../../lib/formatting";
import * as m from "../../paraglide/messages";

const Stage = ({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) => (
  <Flex
    justify="space-between"
    align="baseline"
    px={3}
    py={2}
    borderRadius="md"
    bg={highlight ? "green.subtle" : "bg.muted"}
    color={highlight ? "green.fg" : undefined}
  >
    <Text fontSize="sm" color={highlight ? undefined : "fg.muted"}>
      {label}
    </Text>
    <Text fontWeight="medium">{value}</Text>
  </Flex>
);

const Step = ({ label, ratio }: { label: string; ratio?: number }) => (
  <Flex align="center" gap={2} pl={3} fontSize="xs" color="fg.muted">
    <FiArrowDown aria-hidden />
    <Text>{label}</Text>
    <Text fontWeight="medium" color="green.fg">
      {ratio === undefined ? "n/a" : `−${formatPercent(ratio)}`}
    </Text>
  </Flex>
);

export const StorageEfficiency = ({
  savings,
}: {
  savings: SnapshotSavings;
}) => {
  const saved = savings.savedRatio ?? savings.dedupRatio;
  const reduction = formatReductionRatio(
    savings.sourceBytes,
    savings.packedBytes,
  );

  return (
    <Stack gap={1}>
      <Text fontSize="xs" color="fg.muted" mb={1}>
        {m.op_row_storage_efficiency_hint()}
      </Text>
      <Stage
        label={m.op_row_fe_size()}
        value={formatBytes(savings.sourceBytes)}
      />
      <Step label={m.op_row_dedup_step()} ratio={savings.dedupRatio} />
      <Stage
        label={m.op_row_after_dedup()}
        value={formatBytes(savings.dedupedBytes)}
      />
      {savings.packedBytes !== undefined ? (
        <>
          <Step
            label={m.op_row_compression_step()}
            ratio={savings.compressionRatio}
          />
          <Stage
            label={m.op_row_stored_in_repo()}
            value={formatBytes(savings.packedBytes)}
            highlight
          />
        </>
      ) : (
        <Text fontSize="xs" color="fg.muted" pl={3}>
          {m.op_row_compression_unavailable()}
        </Text>
      )}
      <Box mt={3}>
        <Flex justify="space-between" fontSize="sm" mb={1}>
          <Text color="fg.muted">{m.op_row_space_saved()}</Text>
          <Text fontWeight="medium">
            {formatPercent(saved)}
            {reduction && (
              <Text as="span" color="fg.muted" fontWeight="normal">
                {" · "}
                {reduction}
              </Text>
            )}
          </Text>
        </Flex>
        <Box h={2} borderRadius="full" bg="bg.muted" overflow="hidden">
          <Box
            h="100%"
            bg="green.solid"
            style={{ width: `${Math.max(0, Math.min(1, saved)) * 100}%` }}
          />
        </Box>
      </Box>
    </Stack>
  );
};
