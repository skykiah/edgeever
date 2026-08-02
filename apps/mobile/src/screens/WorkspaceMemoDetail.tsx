import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { resolveMemoContentMarkdown, type MemoDetail } from "@edgeever/shared";
import { ActivityIndicator, Image as RNImage, Platform, ScrollView, StyleSheet, Text as RNText, useWindowDimensions, View, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { Modal } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Markdown, { type ASTNode, type RenderRules } from "react-native-markdown-display";
import { SvgXml } from "react-native-svg";
import { ChevronDown, ChevronLeft, ChevronRight, History, MoreHorizontal, Pencil, RotateCcw, Search, Tag, Trash2, X } from "../components/icons";
import { Pressable, Text, TextInput } from "../components/LocalizedText";
import { MobileMermaidDiagram, MobileMermaidProvider } from "../components/MobileMermaid";
import { getMobileMarkdownFenceLanguage, trimMobileMarkdownFenceContent } from "../lib/mobile-mermaid";
import { useMobileLocale } from "../lib/mobile-locale";
import { resolveMobileThemeStyles, useMobileTheme } from "../lib/mobile-theme";
import { useSession } from "../lib/session";
import { beginEditorStartup } from "../lib/startup-performance";
import type { MobileSyncQueueItem } from "../lib/sync-queue";
import { formatDate, getTextSearchMatches } from "./workspace-utils";
import { styles } from "./workspace-styles";

const DETAIL_CONTENT_HORIZONTAL_PADDING = 16;
const DETAIL_TABLE_FIT_COLUMN_COUNT = 3;
const DETAIL_TABLE_MIN_COLUMN_WIDTH = 132;
const ANDROID_SYSTEM_NAVIGATION_FALLBACK = 48;
const DEFAULT_MEMO_TITLE = "无标题笔记";
const useMobileLocalePreference = () => useMobileLocale().preference;

const getAuthenticatedResourceSource = (
  source: string,
  session: { baseUrl: string; token: string } | null
) => {
  const baseUrl = session?.baseUrl.replace(/\/+$/, "") ?? "";
  const uri = source.startsWith("/") && baseUrl ? `${baseUrl}${source}` : source;
  const isProtectedResource = source.startsWith("/api/v1/resources/") || Boolean(baseUrl && uri.startsWith(`${baseUrl}/api/v1/resources/`));

  return {
    uri,
    ...(session?.token && isProtectedResource ? { headers: { Authorization: `Bearer ${session.token}` } } : {}),
  };
};

type CachedSvgResource = {
  aspectRatio: number | null;
  xml: string;
};

const AUTHENTICATED_SVG_CACHE_LIMIT = 24;
const authenticatedSvgCache = new Map<string, Promise<CachedSvgResource | null>>();
const getAuthenticatedSvgCacheKey = (source: ReturnType<typeof getAuthenticatedResourceSource>) =>
  `${source.uri}\n${source.headers?.Authorization ?? ""}`;
const loadAuthenticatedSvg = (source: ReturnType<typeof getAuthenticatedResourceSource>) => {
  const cacheKey = getAuthenticatedSvgCacheKey(source);
  const cached = authenticatedSvgCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  if (authenticatedSvgCache.size >= AUTHENTICATED_SVG_CACHE_LIMIT) {
    const oldestKey = authenticatedSvgCache.keys().next().value;
    if (oldestKey) {
      authenticatedSvgCache.delete(oldestKey);
    }
  }
  const pending = fetch(source.uri, { headers: source.headers })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Resource request failed with ${response.status}`);
      }
      if (!response.headers.get("Content-Type")?.toLowerCase().includes("svg")) {
        return null;
      }
      const xml = await response.text();
      const viewBox = xml.match(/viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
      const width = Number(viewBox?.[1]);
      const height = Number(viewBox?.[2]);
      return {
        aspectRatio: width > 0 && height > 0 ? width / height : null,
        xml,
      };
    })
    .catch(() => {
      authenticatedSvgCache.delete(cacheKey);
      return null;
    });
  authenticatedSvgCache.set(cacheKey, pending);
  return pending;
};

const AuthenticatedResourceImage = ({
  alt,
  fitAspect = false,
  resizeMode = "cover",
  source,
  style,
}: {
  alt: string;
  fitAspect?: boolean;
  resizeMode?: "center" | "contain" | "cover" | "repeat" | "stretch";
  source: ReturnType<typeof getAuthenticatedResourceSource>;
  style: StyleProp<ImageStyle>;
}) => {
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [svgXml, setSvgXml] = useState<string | null>(null);
  const svgRequestStartedRef = useRef(false);
  const svgSourceKeyRef = useRef("");
  const svgSourceKey = getAuthenticatedSvgCacheKey(source);
  const imageStyle = fitAspect ? [style, { aspectRatio, height: undefined, width: "100%" as const }] : style;

  useEffect(() => {
    setSvgXml(null);
    setAspectRatio(16 / 9);
    svgRequestStartedRef.current = false;
    svgSourceKeyRef.current = svgSourceKey;
    const cached = authenticatedSvgCache.get(svgSourceKey);
    if (cached) {
      svgRequestStartedRef.current = true;
      void cached.then((result) => {
        if (!result || svgSourceKeyRef.current !== svgSourceKey) {
          return;
        }
        if (result.aspectRatio) {
          setAspectRatio(result.aspectRatio);
        }
        setSvgXml(result.xml);
      });
    }
    return () => {
      if (svgSourceKeyRef.current === svgSourceKey) {
        svgSourceKeyRef.current = "";
      }
    };
  }, [svgSourceKey]);

  const loadSvgFallback = () => {
    if (svgRequestStartedRef.current) {
      return;
    }
    svgRequestStartedRef.current = true;
    void loadAuthenticatedSvg(source)
      .then((result) => {
        if (!result || svgSourceKeyRef.current !== svgSourceKey) {
          return;
        }
        if (result.aspectRatio) {
          setAspectRatio(result.aspectRatio);
        }
        setSvgXml(result.xml);
      });
  };

  if (svgXml) {
    return (
      <View accessibilityLabel={alt || undefined} accessible={Boolean(alt)} style={imageStyle}>
        <SvgXml height="100%" width="100%" xml={svgXml} />
      </View>
    );
  }

  return (
    <RNImage
      accessibilityLabel={alt || undefined}
      accessible={Boolean(alt)}
      fadeDuration={Platform.OS === "android" ? 0 : undefined}
      onLoad={(event) => {
        const { height, width } = event.nativeEvent.source;
        if (height > 0 && width > 0) {
          setAspectRatio(width / height);
        }
      }}
      onError={loadSvgFallback}
      resizeMethod={Platform.OS === "android" ? "resize" : "auto"}
      resizeMode={resizeMode}
      source={source}
      style={imageStyle}
    />
  );
};


const DetailActionSheetItem = ({ danger = false, disabled = false, icon, label, onPress }: { danger?: boolean; disabled?: boolean; icon: ReactNode; label: string; onPress: () => void }) => (
  <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.actionSheetItem, disabled && styles.buttonDisabled]}>
    {icon}
    <Text style={[styles.actionSheetItemText, danger && styles.actionSheetItemTextDanger]}>{label}</Text>
  </Pressable>
);

const DetailActionButton = ({ children, disabled = false, label, onPress }: { children: ReactNode; disabled?: boolean; label: string; onPress: () => void }) => (
  <Pressable disabled={disabled} onPress={onPress} style={[styles.actionButton, disabled && styles.buttonDisabled]}>
    {children}
    <Text style={styles.actionButtonText}>{label}</Text>
  </Pressable>
);

export const MemoDetailModal = ({
  isDeleting,
  isLoading,
  isRestoring,
  isSaving,
  memo,
  notebookName,
  onClose,
  onDelete,
  onRichEdit,
  onOpenRevisions,
  onResolveSyncConflict,
  onRestore,
  syncStatus,
  visible,
}: {
  isDeleting: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  isSaving: boolean;
  memo: MemoDetail | null;
  notebookName: string;
  onClose: () => void;
  onDelete: (memo: MemoDetail) => void;
  onRichEdit: (memo: MemoDetail) => void;
  onOpenRevisions: (memo: MemoDetail) => void;
  onResolveSyncConflict: (memo: MemoDetail) => void;
  onRestore: (memo: MemoDetail) => void;
  syncStatus: MobileSyncQueueItem["status"] | null;
  visible: boolean;
}) => {
  const { session } = useSession();
  const { resolvedTheme } = useMobileTheme();
  const { resolvedLocale } = useMobileLocale();
  const { width: viewportWidth } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const localePreference = useMobileLocalePreference();
  const themedDetailMarkdownStyles = useMemo(
    () => resolveMobileThemeStyles(detailMarkdownStyles, resolvedTheme),
    [resolvedTheme]
  );
  const detailMarkdownRules = useMemo<RenderRules>(() => {
    const availableTableWidth = Math.max(0, viewportWidth - DETAIL_CONTENT_HORIZONTAL_PADDING * 2);
    const getTableColumnCount = (node: ASTNode, parents: ASTNode[]) => {
      const table = node.type === "table" ? node : parents.find((parent) => parent.type === "table");
      const tableSection = table?.children.find((child) => child.type === "thead" || child.type === "tbody");
      const firstRow = tableSection?.children.find((child) => child.type === "tr");
      return Math.max(1, firstRow?.children.filter((child) => child.type === "th" || child.type === "td").length ?? 1);
    };
    const renderTableCell = (node: ASTNode, children: ReactNode[], parents: ASTNode[], markdownStyles: Record<string, StyleProp<ViewStyle>>, isHeader: boolean) => {
      const columnCount = getTableColumnCount(node, parents);
      const row = parents.find((parent) => parent.type === "tr");
      const cellIndex = row?.children.findIndex((child) => child.key === node.key) ?? -1;
      const isLastCell = cellIndex === (row?.children.length ?? 0) - 1;
      const wideCellStyle = columnCount > DETAIL_TABLE_FIT_COLUMN_COUNT
        ? { flex: 0, width: DETAIL_TABLE_MIN_COLUMN_WIDTH }
        : undefined;

      return (
        <View
          key={node.key}
          style={[
            markdownStyles[isHeader ? "_VIEW_SAFE_th" : "_VIEW_SAFE_td"],
            wideCellStyle,
            !isLastCell && markdownStyles._VIEW_SAFE_tableCellDivider,
          ]}
        >
          {children}
        </View>
      );
    };

    const renderSelectableTextBlock = (
      node: ASTNode,
      children: ReactNode[],
      markdownStyles: Record<string, StyleProp<ViewStyle>>,
    ) => (
      <RNText key={node.key} selectable style={markdownStyles[node.type] as StyleProp<TextStyle>}>
        {children}
      </RNText>
    );

    // Select complete block-level text nodes instead of every inline text group.
    // Android then keeps dividers and other View-based blocks in the native layout
    // while still exposing the system copy menu for normal note text.
    return {
      code_block: (node, _children, _parents, markdownStyles, inheritedStyles = {}) => (
        <RNText key={node.key} selectable style={[inheritedStyles, markdownStyles.code_block]}>
          {node.content.endsWith("\n") ? node.content.slice(0, -1) : node.content}
        </RNText>
      ),
      fence: (node, _children, _parents, markdownStyles, inheritedStyles = {}) => {
        const language = getMobileMarkdownFenceLanguage((node as ASTNode & { sourceInfo?: string }).sourceInfo);
        const content = trimMobileMarkdownFenceContent(node.content);
        if (language === "mermaid") {
          return (
            <MobileMermaidDiagram
              key={node.key}
              locale={resolvedLocale}
              source={content}
              theme={resolvedTheme}
            />
          );
        }
        return <RNText key={node.key} selectable style={[inheritedStyles, markdownStyles.fence]}>{content}</RNText>;
      },
      image: (node, _children, _parents, markdownStyles) => (
        <AuthenticatedResourceImage
          alt={String(node.attributes.alt ?? "")}
          fitAspect
          key={node.key}
          resizeMode="contain"
          source={getAuthenticatedResourceSource(String(node.attributes.src ?? ""), session)}
          style={markdownStyles._VIEW_SAFE_image}
        />
      ),
      heading1: (node, children, _parents, markdownStyles) => renderSelectableTextBlock(node, children, markdownStyles),
      heading2: (node, children, _parents, markdownStyles) => renderSelectableTextBlock(node, children, markdownStyles),
      heading3: (node, children, _parents, markdownStyles) => renderSelectableTextBlock(node, children, markdownStyles),
      heading4: (node, children, _parents, markdownStyles) => renderSelectableTextBlock(node, children, markdownStyles),
      heading5: (node, children, _parents, markdownStyles) => renderSelectableTextBlock(node, children, markdownStyles),
      heading6: (node, children, _parents, markdownStyles) => renderSelectableTextBlock(node, children, markdownStyles),
      paragraph: (node, children, _parents, markdownStyles) => renderSelectableTextBlock(node, children, markdownStyles),
      table: (node, children, parents, markdownStyles) => {
        const columnCount = getTableColumnCount(node, parents);
        const tableWidth = columnCount > DETAIL_TABLE_FIT_COLUMN_COUNT
          ? columnCount * DETAIL_TABLE_MIN_COLUMN_WIDTH
          : availableTableWidth;

        return (
          <ScrollView
            contentContainerStyle={markdownStyles._VIEW_SAFE_tableScrollContent}
            horizontal
            key={node.key}
            nestedScrollEnabled
            showsHorizontalScrollIndicator={columnCount > DETAIL_TABLE_FIT_COLUMN_COUNT}
            style={markdownStyles._VIEW_SAFE_tableScroll}
          >
            <View style={[markdownStyles._VIEW_SAFE_table, { width: tableWidth }]}>{children}</View>
          </ScrollView>
        );
      },
      td: (node, children, parents, markdownStyles) => renderTableCell(node, children, parents, markdownStyles, false),
      th: (node, children, parents, markdownStyles) => renderTableCell(node, children, parents, markdownStyles, true),
    };
  }, [resolvedLocale, resolvedTheme, session, viewportWidth]);
  const detailText = memo
    ? resolveMemoContentMarkdown(memo.contentJson, memo.contentMarkdown) || memo.contentText || "没有正文内容"
    : "没有正文内容";
  const searchMatches = useMemo(() => getTextSearchMatches(detailText, searchQuery), [detailText, searchQuery]);
  const searchMatchLabel = searchQuery.trim() ? `${searchMatches.length > 0 ? activeMatchIndex + 1 : 0}/${searchMatches.length}` : "0/0";
  const syncStatusLabel = isSaving || syncStatus === "syncing"
    ? "保存中"
    : syncStatus === "conflict"
      ? "同步冲突"
      : syncStatus === "error"
        ? "同步失败"
        : syncStatus === "pending"
          ? "待同步"
          : "已同步";
  const editFabBottom = Math.max(
    safeAreaInsets.bottom,
    Platform.OS === "android" ? ANDROID_SYSTEM_NAVIGATION_FALLBACK : 0
  ) + 16;

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [detailText, searchQuery]);

  const moveSearchMatch = (direction: 1 | -1) => {
    if (searchMatches.length === 0) {
      return;
    }

    setActiveMatchIndex((current) => (current + direction + searchMatches.length) % searchMatches.length);
  };

  const closeActionsAndRun = (action: () => void) => {
    setActionsOpen(false);
    action();
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.detailHeader}>
          <Pressable accessibilityLabel="返回列表" accessibilityRole="button" onPress={onClose} style={styles.detailHeaderButton}>
            <ChevronLeft color="#475569" size={21} />
          </Pressable>
          <View style={styles.detailHeaderActions}>
            <Pressable
              accessibilityHint={syncStatus === "conflict" ? "查看并处理同步冲突" : undefined}
              accessibilityLabel={syncStatusLabel}
              accessibilityRole={syncStatus === "conflict" ? "button" : "text"}
              disabled={syncStatus !== "conflict" || !memo}
              onPress={() => memo && onResolveSyncConflict(memo)}
            >
              <Text
                numberOfLines={1}
                style={[styles.detailSyncStatus, syncStatus === "conflict" && styles.detailSyncStatusConflict]}
              >
                {syncStatusLabel}
              </Text>
            </Pressable>
            {memo && !memo.isDeleted ? (
              <Pressable
                accessibilityLabel="版本历史"
                accessibilityRole="button"
                onPress={() => onOpenRevisions(memo)}
                style={styles.detailHeaderIconButton}
              >
                <History color="#475569" size={20} />
              </Pressable>
            ) : null}
            {memo?.isDeleted ? (
              <Pressable accessibilityLabel="笔记操作" accessibilityRole="button" onPress={() => setActionsOpen(true)} style={styles.detailHeaderIconButton}>
                <MoreHorizontal color="#475569" size={21} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#0f172a" />
          </View>
        ) : memo ? (
          <ScrollView contentContainerStyle={styles.detailContent}>
            <Text selectable style={styles.detailTitle}>{memo.title?.trim() || DEFAULT_MEMO_TITLE}</Text>
            <View style={styles.detailMetaRow}>
              <View style={styles.detailNotebookButton}>
                <Text numberOfLines={1} selectable style={styles.detailNotebookName}>{notebookName}</Text>
                <ChevronDown color="#94a3b8" size={14} />
              </View>
              <View style={styles.detailTagsGroup}>
                <Tag color="#64748b" size={16} />
                <Text
                  numberOfLines={1}
                  selectable
                  style={[styles.detailTagsInline, memo.tags.length === 0 && styles.detailTagsPlaceholder]}
                >
                  {memo.tags.length ? memo.tags.join(", ") : "添加标签，用逗号分隔"}
                </Text>
              </View>
            </View>
            {searchOpen ? (
              <View style={styles.noteSearchPanel}>
                <View style={styles.searchBox}>
                  <Search color="#64748b" size={18} />
                  <TextInput
                    accessibilityLabel="在当前笔记内搜索"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setSearchQuery}
                    placeholder="在当前笔记内搜索"
                    placeholderTextColor="#94a3b8"
                    style={styles.searchInput}
                    value={searchQuery}
                  />
                  <Text style={[styles.noteSearchCount, searchQuery.trim() && searchMatches.length === 0 && styles.noteSearchCountEmpty]}>{searchMatchLabel}</Text>
                </View>
                <View style={styles.richEditorSearchActions}>
                  <DetailActionButton disabled={searchMatches.length === 0} label="上一个搜索结果" onPress={() => moveSearchMatch(-1)}>
                    <ChevronLeft color={searchMatches.length === 0 ? "#cbd5e1" : "#0f172a"} size={16} />
                  </DetailActionButton>
                  <DetailActionButton disabled={searchMatches.length === 0} label="下一个搜索结果" onPress={() => moveSearchMatch(1)}>
                    <ChevronRight color={searchMatches.length === 0 ? "#cbd5e1" : "#0f172a"} size={16} />
                  </DetailActionButton>
                  <DetailActionButton label="关闭搜索" onPress={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}>
                    <X color="#0f172a" size={16} />
                  </DetailActionButton>
                </View>
              </View>
            ) : null}
            <View style={styles.detailDivider} />
            {searchOpen && searchQuery.trim() ? (
              <HighlightedDetailText activeIndex={activeMatchIndex} matches={searchMatches} text={detailText} />
            ) : (
              <MobileMermaidProvider theme={resolvedTheme}>
                <Markdown rules={detailMarkdownRules} style={themedDetailMarkdownStyles}>{detailText}</Markdown>
              </MobileMermaidProvider>
            )}
          </ScrollView>
        ) : (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>笔记加载失败</Text>
          </View>
        )}
        {memo && !memo.isDeleted ? (
          <Pressable
            accessibilityLabel="编辑笔记"
            accessibilityRole="button"
            onPress={() => {
              beginEditorStartup();
              onRichEdit(memo);
            }}
            style={[styles.detailEditFab, { bottom: editFabBottom }]}
          >
            <Pencil color="#ffffff" size={20} />
          </Pressable>
        ) : null}
        {memo?.isDeleted ? (
          <Modal animationType="fade" onRequestClose={() => setActionsOpen(false)} transparent visible={actionsOpen}>
            <Pressable onPress={() => setActionsOpen(false)} style={styles.actionSheetBackdrop}>
              <Pressable style={styles.actionSheet}>
                <View style={styles.actionSheetHandle} />
                <Text style={styles.actionSheetTitle}>笔记操作</Text>
                <DetailActionSheetItem icon={<Search color="#0f172a" size={18} />} label="搜索当前笔记" onPress={() => closeActionsAndRun(() => {
                  setSearchOpen(true);
                })} />
                <DetailActionSheetItem icon={<History color="#0f172a" size={18} />} label="版本历史" onPress={() => closeActionsAndRun(() => onOpenRevisions(memo))} />
                <DetailActionSheetItem disabled={isRestoring} icon={<RotateCcw color="#0f172a" size={18} />} label={isRestoring ? "恢复中" : "恢复笔记"} onPress={() => closeActionsAndRun(() => onRestore(memo))} />
                <View style={styles.listActionDivider} />
                <DetailActionSheetItem danger disabled={isDeleting} icon={<Trash2 color="#b91c1c" size={18} />} label={isDeleting ? "删除中" : "彻底删除"} onPress={() => closeActionsAndRun(() => onDelete(memo))} />
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
};

const HighlightedDetailText = ({
  activeIndex,
  matches,
  text,
}: {
  activeIndex: number;
  matches: Array<{ end: number; start: number }>;
  text: string;
}) => {
  if (matches.length === 0) {
    return <Text selectable style={styles.detailMarkdown}>{text}</Text>;
  }

  const segments: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      segments.push(text.slice(cursor, match.start));
    }

    segments.push(
      <Text key={`${match.start}-${match.end}`} style={index === activeIndex ? styles.noteSearchHighlightActive : styles.noteSearchHighlight}>
        {text.slice(match.start, match.end)}
      </Text>
    );
    cursor = match.end;
  });

  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  return <Text selectable style={styles.detailMarkdown}>{segments}</Text>;
};


const detailMarkdownStyles = StyleSheet.create({
  body: {
    color: "#0f172a",
    fontSize: 17,
    lineHeight: 27,
  },
  blockquote: {
    backgroundColor: "#f8fafc",
    borderLeftColor: "#94a3b8",
    borderLeftWidth: 3,
    marginVertical: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bullet_list: {
    marginVertical: 8,
  },
  code_inline: {
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    color: "#334155",
    fontSize: 15,
  },
  fence: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
    borderRadius: 8,
    color: "#e2e8f0",
    fontSize: 14,
    marginVertical: 10,
    padding: 12,
  },
  heading1: {
    color: "#0f172a",
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 34,
    marginBottom: 10,
    marginTop: 14,
  },
  heading2: {
    color: "#0f172a",
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 29,
    marginBottom: 8,
    marginTop: 18,
  },
  heading3: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 26,
    marginBottom: 6,
    marginTop: 14,
  },
  hr: {
    backgroundColor: "#66ca80",
    height: 1,
    marginVertical: 24,
  },
  link: {
    color: "#059669",
  },
  list_item: {
    marginVertical: 3,
  },
  ordered_list: {
    marginVertical: 8,
  },
  paragraph: {
    marginBottom: 10,
    marginTop: 0,
  },
  strong: {
    fontWeight: "800",
  },
  table: {
    backgroundColor: "#ffffff",
    borderColor: "#d8d8d8",
    borderRadius: 2,
    borderWidth: 1,
    overflow: "hidden",
  },
  tableCellDivider: {
    borderRightColor: "#dedede",
    borderRightWidth: 1,
  },
  tableScroll: {
    marginBottom: 10,
    marginTop: 10,
    maxWidth: "100%",
  },
  tableScrollContent: {
    flexGrow: 1,
  },
  td: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  th: {
    backgroundColor: "#f2f2f2",
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  tr: {
    borderBottomColor: "#dedede",
    borderBottomWidth: 1,
    flexDirection: "row",
  },
});
