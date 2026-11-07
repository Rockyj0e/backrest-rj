import { useEffect, useMemo, useState } from "react";
import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { create } from "@bufbuild/protobuf";
import {
  GetSnapshotChangesRequestSchema,
  GetSnapshotChangesResponse,
} from "../../../gen/ts/v1/service_pb";
import { FiChevronRight, FiFile, FiFolder } from "react-icons/fi";
import { backrestService } from "../../api/client";
import { alerts, formatErrorAlert } from "../../components/common/Alerts";
import { formatBytes } from "../../lib/formatting";
import * as m from "../../paraglide/messages";
import {
  baseName,
  breadcrumbs,
  childDirs,
  filesIn,
  startingPath,
  unlistedSize,
} from "./snapshotChanges";

interface ListedItem {
  key: string;
  name: string;
  size: number;
  detail: string;
  folder?: string; // path to open when clicked
}

const ItemRow = ({ item, max }: { item: ListedItem; max: number }) => {
  return (
    <Flex align="center" gap={3} w="100%">
      <Box flex="0 0 auto" color="fg.muted">
        {item.folder ? <FiFolder /> : <FiFile />}
      </Box>
      <Box flex="1 1 0" minW={0}>
        <Text fontSize="sm" truncate>
          {item.name}
        </Text>
        <Box mt={1} h={1.5} borderRadius="full" bg="bg.muted">
          <Box
            h="100%"
            borderRadius="full"
            bg="green.solid"
            style={{ width: `${max > 0 ? (item.size / max) * 100 : 0}%` }}
          />
        </Box>
      </Box>
      <Box flex="0 0 auto" minW="6.5rem" textAlign="right">
        <Text fontSize="sm" fontWeight="medium">
          {formatBytes(item.size)}
        </Text>
        <Text fontSize="xs" color="fg.muted">
          {item.detail}
        </Text>
      </Box>
    </Flex>
  );
};

export const SnapshotChanges = ({
  repoId,
  snapshotId,
  parentId,
  cache,
}: {
  repoId: string;
  snapshotId: string;
  parentId?: string;
  cache: Map<string, GetSnapshotChangesResponse>;
}) => {
  const [resp, setResp] = useState<GetSnapshotChangesResponse | null>(
    cache.get(snapshotId) ?? null,
  );
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (!parentId || cache.has(snapshotId)) return;
    let cancelled = false;
    backrestService
      .getSnapshotChanges(
        create(GetSnapshotChangesRequestSchema, {
          repoId,
          snapshotId,
          parentId,
        }),
      )
      .then((r) => {
        cache.set(snapshotId, r);
        if (!cancelled) setResp(r);
      })
      .catch((e) => {
        if (cancelled) return;
        setFailed(true);
        alerts.error(formatErrorAlert(e, m.changes_failed()));
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, snapshotId, parentId, cache]);

  const path = useMemo(
    () => (resp ? (current ?? startingPath(resp)) : "/"),
    [resp, current],
  );

  if (!parentId) {
    return (
      <Text fontSize="sm" color="fg.muted">
        {m.changes_no_parent()}
      </Text>
    );
  }
  if (failed) {
    return (
      <Text fontSize="sm" color="fg.muted">
        {m.changes_failed()}
      </Text>
    );
  }
  if (!resp) {
    return (
      <Text fontSize="sm" color="fg.muted">
        {m.changes_loading()}
      </Text>
    );
  }
  if (resp.totalFiles === 0n) {
    return (
      <Text fontSize="sm" color="fg.muted">
        {m.changes_empty()}
      </Text>
    );
  }

  const here = resp.dirs.find((d) => d.path === path);
  const hereSize = Number(here?.size ?? 0n);
  const items: ListedItem[] = [
    ...childDirs(resp, path).map((d) => ({
      key: `d:${d.path}`,
      name: baseName(d.path),
      size: Number(d.size),
      detail: m.changes_files_count({ count: String(d.files) }),
      folder: d.path,
    })),
    ...filesIn(resp, path).map((f) => ({
      key: `f:${f.path}`,
      name: baseName(f.path),
      size: Number(f.size),
      detail:
        f.modifier === "+" ? m.changes_file_new() : m.changes_file_modified(),
    })),
  ];
  const other = unlistedSize(resp, path);
  if (other > 0) {
    items.push({
      key: "other",
      name: m.changes_other_files(),
      size: other,
      detail: "",
    });
  }
  items.sort((a, b) => b.size - a.size);

  return (
    <Stack gap={3}>
      <Text fontSize="sm">
        {m.changes_summary({
          files: String(resp.totalFiles),
          size: formatBytes(Number(resp.totalSize)),
        })}{" "}
        {resp.addedBytes > 0n &&
          m.changes_restic_added({
            size: formatBytes(Number(resp.addedBytes)),
          })}{" "}
        {resp.removedFiles > 0n &&
          m.changes_removed({ count: String(resp.removedFiles) })}
      </Text>
      <Text fontSize="xs" color="fg.muted">
        {m.changes_hint()}
        {resp.truncated ? ` ${m.changes_truncated()}` : ""}
      </Text>

      <Flex align="center" wrap="wrap" gap={1} fontSize="sm">
        {breadcrumbs(path).map((p, i, all) => (
          <Flex key={p} align="center" gap={1}>
            {i > 0 && <FiChevronRight />}
            {i === all.length - 1 ? (
              <Text fontWeight="medium">{p === "/" ? "/" : baseName(p)}</Text>
            ) : (
              <Button
                size="xs"
                variant="plain"
                px={1}
                onClick={() => setCurrent(p)}
              >
                {p === "/" ? "/" : baseName(p)}
              </Button>
            )}
          </Flex>
        ))}
        <Text fontSize="xs" color="fg.muted" ml={2}>
          {formatBytes(hereSize)}
        </Text>
      </Flex>

      <Stack gap={2}>
        {items.map((item) =>
          item.folder ? (
            <Box
              key={item.key}
              role="button"
              tabIndex={0}
              cursor="pointer"
              title={m.changes_open_folder()}
              borderRadius="md"
              _hover={{ bg: "bg.muted" }}
              onClick={() => setCurrent(item.folder!)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setCurrent(item.folder!);
                }
              }}
            >
              <ItemRow item={item} max={items[0].size} />
            </Box>
          ) : (
            <ItemRow key={item.key} item={item} max={items[0].size} />
          ),
        )}
      </Stack>
    </Stack>
  );
};
