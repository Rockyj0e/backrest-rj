import { useState } from "react";
import { Box, Flex, IconButton, Stack, Text } from "@chakra-ui/react";
import { FiArrowRight, FiEye, FiEyeOff } from "react-icons/fi";
import {
  SnapshotSavings,
  formatBytes,
  formatPercent,
  formatReductionRatio,
  normalizeSnapshotId,
} from "../../lib/formatting";
import {
  getStorageEfficiencyShowRatio,
  setStorageEfficiencyShowRatio,
} from "../../lib/uiPrefs";
import * as m from "../../paraglide/messages";

// Values scale with the width of the panel (container query units) so the three stages
// and the two reduction steps stay on one row even in a narrow side panel.
const valueFontSize = "clamp(12px, 3.8cqw, 16px)";

const Stage = ({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) => (
  <Box
    flex="1 1 0"
    minW={0}
    px={2}
    py={2}
    borderRadius="md"
    bg={highlight ? "green.subtle" : "bg.muted"}
    color={highlight ? "green.fg" : undefined}
  >
    <Text
      fontSize="xs"
      color={highlight ? undefined : "fg.muted"}
      whiteSpace="nowrap"
    >
      {label}
    </Text>
    <Text
      fontWeight="medium"
      whiteSpace="nowrap"
      style={{ fontSize: valueFontSize }}
    >
      {value}
    </Text>
  </Box>
);

const Step = ({ label, ratio }: { label: string; ratio?: number }) => (
  <Flex
    direction="column"
    align="center"
    justify="center"
    flex="0 0 auto"
    px={1}
    fontSize="11px"
    lineHeight="short"
    color="fg.muted"
  >
    <Text whiteSpace="nowrap">{label}</Text>
    <FiArrowRight aria-hidden />
    <Text fontWeight="medium" color="green.fg" whiteSpace="nowrap">
      {ratio === undefined ? "n/a" : `−${formatPercent(ratio)}`}
    </Text>
  </Flex>
);

export const StorageEfficiency = ({
  savings,
  parentId,
}: {
  savings: SnapshotSavings;
  parentId?: string;
}) => {
  const [showRatio, setShowRatio] = useState(getStorageEfficiencyShowRatio);
  const saved = savings.savedRatio ?? savings.dedupRatio;
  const reduction = formatReductionRatio(
    savings.sourceBytes,
    savings.packedBytes,
  );

  const toggleRatio = () => {
    setShowRatio(!showRatio);
    setStorageEfficiencyShowRatio(!showRatio);
  };

  return (
    <Stack gap={2} style={{ containerType: "inline-size" }}>
      <Text fontSize="sm">
        {m.op_row_efficiency_summary({
          reused: formatBytes(
            Math.max(0, savings.sourceBytes - savings.dedupedBytes),
          ),
          total: formatBytes(savings.sourceBytes),
          added: formatBytes(savings.packedBytes ?? savings.dedupedBytes),
        })}
      </Text>
      <Text fontSize="xs" color="fg.muted">
        {parentId
          ? m.op_row_efficiency_parent({ id: normalizeSnapshotId(parentId) })
          : m.op_row_efficiency_first()}
      </Text>
      <Flex align="stretch" gap={1}>
        <Stage
          label={m.op_row_fe_size()}
          value={formatBytes(savings.sourceBytes)}
        />
        <Step label={m.op_row_dedup_step()} ratio={savings.dedupRatio} />
        <Stage
          label={m.op_row_new_data()}
          value={formatBytes(savings.dedupedBytes)}
        />
        {savings.packedBytes !== undefined && (
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
        )}
      </Flex>
      {savings.packedBytes === undefined && (
        <Text fontSize="xs" color="fg.muted">
          {m.op_row_compression_unavailable()}
        </Text>
      )}
      <Box mt={1}>
        <Flex justify="space-between" align="center" fontSize="sm" mb={1}>
          <Text color="fg.muted">{m.op_row_space_saved()}</Text>
          <Flex align="center" gap={1}>
            <Text fontWeight="medium">
              {formatPercent(saved)}
              {reduction && showRatio && (
                <Text as="span" color="fg.muted" fontWeight="normal">
                  {" · "}
                  {reduction}
                </Text>
              )}
            </Text>
            {reduction && (
              <IconButton
                size="2xs"
                variant="ghost"
                aria-label={
                  showRatio ? m.op_row_hide_ratio() : m.op_row_show_ratio()
                }
                onClick={toggleRatio}
              >
                {showRatio ? <FiEyeOff /> : <FiEye />}
              </IconButton>
            )}
          </Flex>
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
