"use client";

import {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toBlob } from "html-to-image";
import { IosStoreCanvas } from "@/components/ios-store-canvas";
import {
  IOS_TEMPLATE,
  defaultIosAssetState,
  type IosAssetState,
} from "@/lib/ios-template";

type AssetItem = IosAssetState & {
  id: string;
};

type ColorKey = "titleColor" | "baseColor" | "glowColor";
type UploadTarget = {
  assetId: string;
  kind: "screenshot" | "backgroundImage";
};

type HistoryState = {
  past: AssetItem[][];
  present: AssetItem[];
  future: AssetItem[][];
};

function createAsset(id: string): AssetItem {
  return {
    ...defaultIosAssetState,
    id,
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function createCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
}

const CRC_TABLE = createCrcTable();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function createZipBlob(files: { name: string; bytes: Uint8Array }[]) {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;
  let centralDirectorySize = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const fileCrc = crc32(file.bytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, fileCrc);
    writeUint32(localView, 18, file.bytes.length);
    writeUint32(localView, 22, file.bytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, fileCrc);
    writeUint32(centralView, 20, file.bytes.length);
    writeUint32(centralView, 24, file.bytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, localOffset);
    centralHeader.set(nameBytes, 46);

    localChunks.push(localHeader, file.bytes);
    centralChunks.push(centralHeader);
    localOffset += localHeader.length + file.bytes.length;
    centralDirectorySize += centralHeader.length;
  }

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralDirectorySize);
  writeUint32(endView, 16, localOffset);
  writeUint16(endView, 20, 0);

  return new Blob(
    [...localChunks, ...centralChunks, endRecord].map((chunk) =>
      toArrayBuffer(chunk),
    ),
    {
      type: "application/zip",
    },
  );
}

function hexLabel(value: string) {
  return value.replace("#", "").toUpperCase();
}

function normalizeHexInput(value: string) {
  return value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase();
}

function toFullHex(value: string) {
  if (value.length === 3) {
    return value
      .split("")
      .map((char) => char + char)
      .join("");
  }

  return value;
}

function toHexColor(value: string) {
  const normalized = normalizeHexInput(value);
  if (normalized.length !== 3 && normalized.length !== 6) {
    return null;
  }

  return `#${toFullHex(normalized)}`.toLowerCase();
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cloneAssets(assets: AssetItem[]) {
  return assets.map((asset) => ({ ...asset }));
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read file as data URL."));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Unable to read selected file."));
    };

    reader.readAsDataURL(file);
  });
}

async function waitForNodeImages(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll("img"));

  await Promise.all(
    images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) {
        if (typeof image.decode === "function") {
          try {
            await image.decode();
          } catch {
            return;
          }
        }
        return;
      }

      await new Promise<void>((resolve) => {
        const finish = () => {
          image.removeEventListener("load", finish);
          image.removeEventListener("error", finish);
          resolve();
        };

        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
      });
    }),
  );
}

export default function Home() {
  const idSeedRef = useRef(2);
  const exportRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previewTileRef = useRef<HTMLDivElement>(null);

  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: [createAsset("asset-1")],
    future: [],
  });
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [previewPanelSelected, setPreviewPanelSelected] = useState(true);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAddHoverVisible, setIsAddHoverVisible] = useState(false);
  const [previewScale, setPreviewScale] = useState<number>(
    IOS_TEMPLATE.previewScale,
  );
  const [isExporting, setIsExporting] = useState(false);
  const [pendingUploadName, setPendingUploadName] = useState<string | null>(null);
  const [editingTitleAssetId, setEditingTitleAssetId] = useState<string | null>(
    null,
  );
  const [titleDraft, setTitleDraft] = useState("");
  const [colorDrafts, setColorDrafts] = useState<Record<ColorKey, string>>({
    titleColor: hexLabel(defaultIosAssetState.titleColor),
    baseColor: hexLabel(defaultIosAssetState.baseColor),
    glowColor: hexLabel(defaultIosAssetState.glowColor),
  });

  const assets = history.present;
  const exportProjectName = "";

  const primarySelectedAsset = useMemo(() => {
    if (!selectedAssetIds.length) {
      return null;
    }

    return (
      assets.find((asset) => asset.id === selectedAssetIds[selectedAssetIds.length - 1]) ??
      null
    );
  }, [assets, selectedAssetIds]);

  const editableAsset =
    selectedAssetIds.length === 1 ? primarySelectedAsset : null;

  const exportBaseName = useMemo(() => {
    const parts = [slugify(exportProjectName), IOS_TEMPLATE.deviceSlug].filter(
      Boolean,
    );
    return parts.join("-");
  }, [exportProjectName]);

  const commitAssets = useCallback(
    (updater: AssetItem[] | ((current: AssetItem[]) => AssetItem[])) => {
      setHistory((current) => {
        const next =
          typeof updater === "function" ? updater(current.present) : updater;

        if (JSON.stringify(next) === JSON.stringify(current.present)) {
          return current;
        }

        return {
          past: [...current.past, cloneAssets(current.present)].slice(-100),
          present: cloneAssets(next),
          future: [],
        };
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) {
        return current;
      }

      return {
        past: current.past.slice(0, -1),
        present: cloneAssets(previous),
        future: [cloneAssets(current.present), ...current.future].slice(0, 100),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) {
        return current;
      }

      return {
        past: [...current.past, cloneAssets(current.present)].slice(-100),
        present: cloneAssets(next),
        future: current.future.slice(1),
      };
    });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isUndoKey = event.key.toLowerCase() === "z";
      const usesModifier = event.metaKey || event.ctrlKey;

      if (!usesModifier || !isUndoKey) {
        return;
      }

      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  useEffect(() => {
    const element = previewTileRef.current;
    if (!element) {
      return;
    }

    const updateScale = () => {
      const width = element.getBoundingClientRect().width;
      if (!width) {
        return;
      }

      setPreviewScale(width / IOS_TEMPLATE.exportWidth);
    };

    updateScale();

    const observer = new ResizeObserver(() => updateScale());
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelectedAssetIds((current) =>
      current.filter((id) => assets.some((asset) => asset.id === id)),
    );
  }, [assets]);

  useEffect(() => {
    if (!editableAsset) {
      setEditingTitleAssetId(null);
      return;
    }

    setColorDrafts({
      titleColor: hexLabel(editableAsset.titleColor),
      baseColor: hexLabel(editableAsset.baseColor),
      glowColor: hexLabel(editableAsset.glowColor),
    });

    if (editingTitleAssetId && editingTitleAssetId !== editableAsset.id) {
      setEditingTitleAssetId(null);
    }
  }, [editableAsset, editingTitleAssetId]);

  useEffect(() => {
    if (!selectedAssetIds.length) {
      setPreviewPanelSelected(true);
    }
  }, [selectedAssetIds]);

  function nextId() {
    const id = `asset-${idSeedRef.current}`;
    idSeedRef.current += 1;
    return id;
  }

  function updateAsset<K extends keyof IosAssetState>(
    assetId: string,
    key: K,
    value: IosAssetState[K],
  ) {
    commitAssets((current) =>
      current.map((asset) =>
        asset.id === assetId ? { ...asset, [key]: value } : asset,
      ),
    );
  }

  function selectPreviewPanel() {
    setSelectedAssetIds([]);
    setPreviewPanelSelected(true);
  }

  function closeSidePanel() {
    setSelectedAssetIds([]);
    setPreviewPanelSelected(true);
    setEditingTitleAssetId(null);
  }

  function selectAsset(assetId: string, withRangeSelection: boolean) {
    setPreviewPanelSelected(false);
    setSelectedAssetIds((current) => {
      if (withRangeSelection) {
        return current.includes(assetId)
          ? current.filter((id) => id !== assetId)
          : [...current, assetId];
      }

      return [assetId];
    });
  }

  function addAsset() {
    const newAsset = createAsset(nextId());
    commitAssets((current) => [...current, newAsset]);
    setSelectedAssetIds([newAsset.id]);
    setPreviewPanelSelected(false);
  }

  function duplicateAsset(assetId: string) {
    const source = assets.find((asset) => asset.id === assetId);
    if (!source) {
      return;
    }

    const duplicate = {
      ...source,
      id: nextId(),
    };

    commitAssets((current) => {
      const index = current.findIndex((asset) => asset.id === assetId);
      if (index === -1) {
        return current;
      }

      const next = [...current];
      next.splice(index + 1, 0, duplicate);
      return next;
    });

    setSelectedAssetIds([duplicate.id]);
    setPreviewPanelSelected(false);
  }

  function deleteAsset(assetId: string) {
    if (assets.length <= 1) {
      return;
    }

    commitAssets((current) => current.filter((asset) => asset.id !== assetId));
    setSelectedAssetIds((current) => current.filter((id) => id !== assetId));
  }

  function deleteSelectedAssets() {
    if (!selectedAssetIds.length || assets.length <= 1) {
      return;
    }

    const idSet = new Set(selectedAssetIds);
    if (assets.filter((asset) => !idSet.has(asset.id)).length === 0) {
      return;
    }

    commitAssets((current) => current.filter((asset) => !idSet.has(asset.id)));
    setSelectedAssetIds([]);
    setPreviewPanelSelected(true);
  }

  function openUploadModal(assetId: string, kind: UploadTarget["kind"]) {
    setUploadTarget({ assetId, kind });
    setPendingUploadName(null);
    setIsUploadModalOpen(true);
  }

  function closeUploadModal() {
    setIsUploadModalOpen(false);
    setUploadTarget(null);
    setPendingUploadName(null);
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !uploadTarget) {
      return;
    }

    setPendingUploadName(file.name);

    try {
      const dataUrl = await fileToDataUrl(file);

      commitAssets((current) =>
        current.map((asset) =>
          asset.id === uploadTarget.assetId
            ? uploadTarget.kind === "backgroundImage"
              ? {
                  ...asset,
                  backgroundMode: "image",
                  backgroundImageSrc: dataUrl,
                  backgroundImageName: file.name,
                }
              : {
                  ...asset,
                  screenshotSrc: dataUrl,
                  screenshotName: file.name,
                }
            : asset,
        ),
      );
      setSelectedAssetIds([uploadTarget.assetId]);
      setPreviewPanelSelected(false);
      closeUploadModal();
    } catch (error) {
      console.error("File upload failed", error);
    } finally {
      event.target.value = "";
    }
  }

  function startInlineTitleEdit(assetId: string, currentTitle: string) {
    setSelectedAssetIds([assetId]);
    setPreviewPanelSelected(false);
    setEditingTitleAssetId(assetId);
    setTitleDraft(currentTitle);
  }

  function commitInlineTitleEdit() {
    if (!editingTitleAssetId) {
      return;
    }

    const nextTitle = titleDraft.trim();
    if (nextTitle) {
      updateAsset(editingTitleAssetId, "title", nextTitle);
    }

    setEditingTitleAssetId(null);
  }

  function handleInlineTitleKeyDown(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditingTitleAssetId(null);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      commitInlineTitleEdit();
    }
  }

  function triggerClickablePanel(
    event: ReactKeyboardEvent<HTMLDivElement>,
    onTrigger: () => void,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onTrigger();
    }
  }

  function handleColorDraftChange(key: ColorKey, rawValue: string) {
    const normalized = normalizeHexInput(rawValue);
    setColorDrafts((current) => ({ ...current, [key]: normalized }));

    const nextColor = toHexColor(normalized);
    if (editableAsset && nextColor) {
      updateAsset(editableAsset.id, key, nextColor);
    }
  }

  function resetColorDraft(key: ColorKey, fallback: string) {
    setColorDrafts((current) => ({
      ...current,
      [key]: hexLabel(fallback),
    }));
  }

  function setBackgroundMode(
    assetId: string,
    mode: IosAssetState["backgroundMode"],
  ) {
    commitAssets((current) =>
      current.map((asset) =>
        asset.id === assetId ? { ...asset, backgroundMode: mode } : asset,
      ),
    );
  }

  function clearBackgroundImage(assetId: string) {
    commitAssets((current) =>
      current.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              backgroundMode: "gradient",
              backgroundImageSrc: null,
              backgroundImageName: null,
            }
          : asset,
      ),
    );
  }

  function clearScreenshot(assetId: string) {
    commitAssets((current) =>
      current.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              screenshotSrc: defaultIosAssetState.screenshotSrc,
              screenshotName: null,
            }
          : asset,
      ),
    );
  }

  async function renderAssetExport(
    assetId: string,
    mode: "selected" | "all",
  ) {
    const node = exportRefs.current[assetId];
    if (!node) {
      return null;
    }

    const assetIndex = assets.findIndex((asset) => asset.id === assetId) + 1;
    await waitForNodeImages(node);

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

    const blob = await toBlob(node, {
      cacheBust: true,
      pixelRatio: 1,
      skipFonts: true,
      width: IOS_TEMPLATE.exportWidth,
      height: IOS_TEMPLATE.exportHeight,
    });

    if (!blob) {
      return null;
    }

    const filename =
      mode === "all"
        ? `${exportBaseName}-screen-${String(assetIndex).padStart(2, "0")}.png`
        : `${exportBaseName}-selected-${String(assetIndex).padStart(2, "0")}.png`;

    return {
      blob,
      bytes: new Uint8Array(await blob.arrayBuffer()),
      filename,
    };
  }

  async function exportAssetIds(assetIds: string[], mode: "selected" | "all") {
    if (!assetIds.length) {
      return;
    }

    setIsExporting(true);

    try {
      const renderedAssets = (
        await Promise.all(
          assetIds.map((assetId) => renderAssetExport(assetId, mode)),
        )
      ).filter((asset): asset is NonNullable<typeof asset> => asset !== null);

      if (!renderedAssets.length) {
        return;
      }

      if (mode === "all") {
        const zipBlob = createZipBlob(
          renderedAssets.map((asset) => ({
            name: asset.filename,
            bytes: asset.bytes,
          })),
        );
        downloadBlob(zipBlob, `${exportBaseName}-screens.zip`);
        return;
      }

      if (renderedAssets.length === 1) {
        downloadBlob(renderedAssets[0].blob, renderedAssets[0].filename);
        return;
      }

      for (const asset of renderedAssets) {
        downloadBlob(asset.blob, asset.filename);
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
    } catch (error) {
      console.error("Export failed", {
        error,
        assetIds,
        mode,
      });
    } finally {
      setIsExporting(false);
    }
  }

  const exportSelectedDisabled = isExporting || selectedAssetIds.length === 0;
  const downloadAllDisabled =
    isExporting || !previewPanelSelected || assets.length === 0;
  const deleteDisabled =
    assets.length <= 1 ||
    (selectedAssetIds.length > 0 && selectedAssetIds.length >= assets.length);
  const sidePanelOpen = Boolean(editableAsset);
  return (
    <main className="studio-shell text-stone-100">
      <div className="studio-ambient studio-ambient-left" />
      <div className="studio-ambient studio-ambient-right" />

      <div className="studio-app">
        <header className="studio-header">
          <img
            src="/assets/zuddl-logo-white.svg"
            alt="Zuddl"
            className="studio-header-logo"
          />
        </header>

        <section className="studio-workspace">
          <div className="studio-grid">
            {sidePanelOpen ? (
              <aside className="studio-panel studio-side-menu">
                <div className="studio-title-wrap">
                  <h1 className="studio-title">Edit asset</h1>
                  <button
                    type="button"
                    className="studio-panel-close"
                    onClick={closeSidePanel}
                    aria-label="Close side panel"
                  >
                    <span className="studio-panel-close-icon" aria-hidden="true">
                      <span className="studio-panel-close-line" />
                      <span className="studio-panel-close-line" />
                    </span>
                  </button>
                </div>

                <div className="studio-selection-meta">
                  Screen{" "}
                  {assets.findIndex((asset) => asset.id === editableAsset!.id) + 1}
                </div>

                <div className="studio-controls">
                  <section className="studio-section studio-section-bordered">
                    <p className="studio-section-label">Headline</p>

                    <div className="studio-field-stack">
                      <span className="studio-field-label">Content</span>
                      <textarea
                        rows={3}
                        value={editableAsset!.title}
                        onChange={(event) =>
                          updateAsset(
                            editableAsset!.id,
                            "title",
                            event.target.value,
                          )
                        }
                        placeholder="Add the headline shown above the device"
                        className="studio-textarea"
                      />
                    </div>

                    <div className="studio-swatch-row">
                      <span className="studio-field-label">Text colour:</span>
                      <label className="studio-swatch">
                        <span className="studio-swatch-chip">
                          <input
                            type="color"
                            value={editableAsset!.titleColor}
                            onChange={(event) =>
                              updateAsset(
                                editableAsset!.id,
                                "titleColor",
                                event.target.value,
                              )
                            }
                            className="studio-color-input"
                          />
                        </span>
                        <input
                          type="text"
                          inputMode="text"
                          value={colorDrafts.titleColor}
                          onChange={(event) =>
                            handleColorDraftChange(
                              "titleColor",
                              event.target.value,
                            )
                          }
                          onBlur={() =>
                            resetColorDraft(
                              "titleColor",
                              editableAsset!.titleColor,
                            )
                          }
                          className="studio-swatch-input"
                          aria-label="Text colour hex code"
                        />
                      </label>
                    </div>
                  </section>

                  <section className="studio-section studio-section-bordered">
                    <p className="studio-section-label">Background</p>

                    <div className="studio-mode-panel">
                      <div className="studio-mode-row">
                        <p className="studio-mode-value">
                          {editableAsset!.backgroundMode === "image"
                            ? "Image"
                            : "Gradient"}
                        </p>

                        <div className="studio-toggle-group">
                          <button
                            type="button"
                            className={`studio-background-toggle ${
                              editableAsset!.backgroundMode === "gradient"
                                ? "studio-toggle-selected"
                                : "studio-toggle-passive"
                            }`}
                            onClick={() =>
                              setBackgroundMode(editableAsset!.id, "gradient")
                            }
                            aria-label="Use gradient background"
                          >
                            <img
                              src="/assets/gradient-icon.svg"
                              alt=""
                              className="studio-toggle-icon"
                            />
                          </button>
                          <button
                            type="button"
                            className={`studio-background-toggle ${
                              editableAsset!.backgroundMode === "image"
                                ? "studio-toggle-selected"
                                : "studio-toggle-passive"
                            }`}
                            onClick={() =>
                              setBackgroundMode(editableAsset!.id, "image")
                            }
                            aria-label="Use image background"
                          >
                            <img
                              src="/assets/image-icon.svg"
                              alt=""
                              className={`studio-toggle-icon studio-toggle-icon-image ${
                                editableAsset!.backgroundMode === "image"
                                  ? "studio-toggle-icon-image-active"
                                  : "studio-toggle-icon-image-passive"
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      <div className="studio-background-mode-body">
                        {editableAsset!.backgroundMode === "image" ? (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              openUploadModal(editableAsset!.id, "backgroundImage")
                            }
                            onKeyDown={(event) =>
                              triggerClickablePanel(event, () =>
                                openUploadModal(editableAsset!.id, "backgroundImage"),
                              )
                            }
                            className="studio-background-upload-row"
                          >
                            <span className="studio-background-upload-copy">
                              {editableAsset!.backgroundImageName
                                ? "Background image"
                                : "Upload background image"}
                            </span>
                            <span className="studio-upload-icon" aria-hidden="true">
                              {editableAsset!.backgroundImageSrc ? (
                                <span className="studio-upload-thumb-wrap">
                                  <img
                                    src={editableAsset!.backgroundImageSrc}
                                    alt=""
                                    className="studio-upload-thumb"
                                  />
                                  <button
                                    type="button"
                                    className="studio-upload-thumb-remove"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      clearBackgroundImage(editableAsset!.id);
                                    }}
                                    data-tooltip="Remove file"
                                    title="Remove file"
                                    aria-label="Remove file"
                                  >
                                    <span
                                      className="studio-upload-thumb-remove-icon"
                                      aria-hidden="true"
                                    >
                                      <span className="studio-panel-close-line" />
                                      <span className="studio-panel-close-line" />
                                    </span>
                                  </button>
                                </span>
                              ) : (
                                <img
                                  src="/assets/upload-combined.svg"
                                  alt=""
                                  className="studio-upload-icon-combined"
                                />
                              )}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="studio-swatch-row">
                              <span className="studio-field-label">Base colour:</span>
                              <label className="studio-swatch">
                                <span className="studio-swatch-chip">
                                  <input
                                    type="color"
                                    value={editableAsset!.baseColor}
                                    onChange={(event) =>
                                      updateAsset(
                                        editableAsset!.id,
                                        "baseColor",
                                        event.target.value,
                                      )
                                    }
                                    className="studio-color-input"
                                  />
                                </span>
                                <input
                                  type="text"
                                  inputMode="text"
                                  value={colorDrafts.baseColor}
                                  onChange={(event) =>
                                    handleColorDraftChange(
                                      "baseColor",
                                      event.target.value,
                                    )
                                  }
                                  onBlur={() =>
                                    resetColorDraft(
                                      "baseColor",
                                      editableAsset!.baseColor,
                                    )
                                  }
                                  className="studio-swatch-input"
                                  aria-label="Base colour hex code"
                                />
                              </label>
                            </div>

                            <div className="studio-swatch-row">
                              <span className="studio-field-label">Glow colour:</span>
                              <label className="studio-swatch">
                                <span className="studio-swatch-chip">
                                  <input
                                    type="color"
                                    value={editableAsset!.glowColor}
                                    onChange={(event) =>
                                      updateAsset(
                                        editableAsset!.id,
                                        "glowColor",
                                        event.target.value,
                                      )
                                    }
                                    className="studio-color-input"
                                  />
                                </span>
                                <input
                                  type="text"
                                  inputMode="text"
                                  value={colorDrafts.glowColor}
                                  onChange={(event) =>
                                    handleColorDraftChange(
                                      "glowColor",
                                      event.target.value,
                                    )
                                  }
                                  onBlur={() =>
                                    resetColorDraft(
                                      "glowColor",
                                      editableAsset!.glowColor,
                                    )
                                  }
                                  className="studio-swatch-input"
                                  aria-label="Glow colour hex code"
                                />
                              </label>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="studio-section studio-section-bordered">
                    <p className="studio-section-label">Screenshot</p>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openUploadModal(editableAsset!.id, "screenshot")}
                      onKeyDown={(event) =>
                        triggerClickablePanel(event, () =>
                          openUploadModal(editableAsset!.id, "screenshot"),
                        )
                      }
                      className="studio-upload-panel"
                    >
                      <span className="studio-upload-row">
                        <span className="studio-upload-copy">
                          {editableAsset!.screenshotName
                            ? editableAsset!.screenshotName
                            : "Upload here or click the phone screen"}
                        </span>

                        <span className="studio-upload-icon" aria-hidden="true">
                          {editableAsset!.screenshotName ? (
                            <span className="studio-upload-thumb-wrap">
                              <img
                                src={editableAsset!.screenshotSrc}
                                alt=""
                                className="studio-upload-thumb"
                              />
                              <button
                                type="button"
                                className="studio-upload-thumb-remove"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  clearScreenshot(editableAsset!.id);
                                }}
                                data-tooltip="Remove file"
                                title="Remove file"
                                aria-label="Remove file"
                              >
                                <span
                                  className="studio-upload-thumb-remove-icon"
                                  aria-hidden="true"
                                >
                                  <span className="studio-panel-close-line" />
                                  <span className="studio-panel-close-line" />
                                </span>
                              </button>
                            </span>
                          ) : (
                            <img
                              src="/assets/upload-combined.svg"
                              alt=""
                              className="studio-upload-icon-combined"
                            />
                          )}
                        </span>
                      </span>
                    </div>
                  </section>

                  <section className="studio-section">
                    <p className="studio-section-label">Asset actions</p>
                    <div className="studio-inline-actions">
                      <button
                        type="button"
                        className="studio-icon-button"
                        onClick={() => duplicateAsset(editableAsset!.id)}
                        aria-label="Duplicate selected asset"
                      >
                        <img src="/assets/icon-duplicate.svg" alt="" className="studio-icon" />
                      </button>
                      <button
                        type="button"
                        className="studio-icon-button studio-icon-button-danger"
                        onClick={deleteSelectedAssets}
                        disabled={deleteDisabled}
                        aria-label="Delete selected assets"
                      >
                        <img src="/assets/icon-trash.svg" alt="" className="studio-icon" />
                      </button>
                    </div>
                  </section>
                </div>
              </aside>
            ) : null}

              <section
              className={`studio-panel studio-preview-panel ${
                sidePanelOpen ? "" : "studio-preview-panel-full"
              } ${previewPanelSelected ? "studio-preview-panel-selected" : ""}`}
              onClick={selectPreviewPanel}
            >
              <div className="studio-preview-toolbar">
                <div className="studio-preview-title-stack">
                  <p className="studio-preview-eyebrow">Preview</p>
                  <h2 className="studio-preview-title">iOS (6.5 inch)</h2>
                </div>

                <div className="studio-preview-actions">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void exportAssetIds(selectedAssetIds, "selected");
                    }}
                    disabled={exportSelectedDisabled}
                    className="studio-button studio-button-primary"
                  >
                    {isExporting ? "Exporting..." : "Export"}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void exportAssetIds(
                        assets.map((asset) => asset.id),
                        "all",
                      );
                    }}
                    disabled={downloadAllDisabled}
                    className="studio-button studio-button-secondary"
                  >
                    Download All
                  </button>
                </div>
              </div>

              <div className="studio-preview-stage-wrap">
                <div className="studio-preview-stage">
                  <div
                    className="studio-asset-rail"
                    onClick={selectPreviewPanel}
                  >
                    {assets.map((asset, index) => {
                      const isSelected = selectedAssetIds.includes(asset.id);
                      const isLastAsset = index === assets.length - 1;
                      return (
                        <div key={asset.id} className="studio-asset-cluster">
                          <div
                            onClick={(event) => {
                              event.stopPropagation();
                              const target = event.target as HTMLElement;

                              if (target.closest("[data-upload-trigger='true']")) {
                                setPreviewPanelSelected(false);
                                setSelectedAssetIds([asset.id]);
                                openUploadModal(asset.id, "screenshot");
                                return;
                              }

                              selectAsset(asset.id, event.shiftKey);
                            }}
                            className={`studio-preview-card ${
                              isSelected ? "studio-preview-frame-selected" : ""
                            }`}
                          >
                            <div className="studio-preview-card-header">
                              <span className="studio-preview-card-name">
                                Screen {index + 1}
                              </span>
                              <div className="studio-card-actions">
                                <button
                                  type="button"
                                  className="studio-icon-plain-button studio-icon-button-danger"
                                  data-no-drag="true"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    deleteAsset(asset.id);
                                  }}
                                  disabled={assets.length <= 1}
                                  aria-label={`Delete screen ${index + 1}`}
                                >
                                  <img src="/assets/icon-trash.svg" alt="" className="studio-icon" />
                                </button>
                                <button
                                  type="button"
                                  className="studio-icon-plain-button"
                                  data-no-drag="true"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    duplicateAsset(asset.id);
                                  }}
                                  aria-label={`Duplicate screen ${index + 1}`}
                                >
                                  <img src="/assets/icon-duplicate.svg" alt="" className="studio-icon" />
                                </button>
                              </div>
                            </div>

                            <div
                              ref={index === 0 ? previewTileRef : undefined}
                              className="studio-preview-canvas-shell"
                            >
                              <IosStoreCanvas
                                asset={asset}
                                interactive
                                scale={previewScale}
                                isTitleEditing={editingTitleAssetId === asset.id}
                                titleDraft={
                                  editingTitleAssetId === asset.id
                                    ? titleDraft
                                    : undefined
                                }
                                onTitleClick={() =>
                                  startInlineTitleEdit(asset.id, asset.title)
                                }
                                onTitleChange={setTitleDraft}
                                onTitleBlur={commitInlineTitleEdit}
                                onTitleKeyDown={handleInlineTitleKeyDown}
                              />
                            </div>
                          </div>

                          {isLastAsset ? (
                            <div
                              className="studio-add-connector-wrap"
                              onMouseEnter={() => {
                                setIsAddHoverVisible(true);
                              }}
                              onMouseLeave={() => setIsAddHoverVisible(false)}
                            >
                              <button
                                type="button"
                                className="studio-add-connector"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  addAsset();
                                  setIsAddHoverVisible(false);
                                }}
                                aria-label="Add screen"
                              >
                                <img
                                  src={
                                    isAddHoverVisible
                                      ? "/assets/add-screen-plus.svg"
                                      : "/assets/add-screen-dot.svg"
                                  }
                                  alt=""
                                  className={
                                    isAddHoverVisible
                                      ? "studio-add-connector-plus"
                                      : "studio-add-connector-dot"
                                  }
                                />
                              </button>

                              {isAddHoverVisible ? (
                                <div className="studio-placeholder-card" aria-hidden="true">
                                  <div className="studio-placeholder-canvas-shell" />
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>

      {isUploadModalOpen ? (
        <div className="studio-modal-backdrop" onClick={closeUploadModal}>
          <div
            className="studio-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="studio-modal-header">
              <h3 className="studio-modal-title">
                {uploadTarget?.kind === "backgroundImage"
                  ? "Upload background"
                  : "Upload screenshot"}
              </h3>
              <button
                type="button"
                className="studio-modal-close"
                onClick={closeUploadModal}
                aria-label="Close upload modal"
              >
                <span className="studio-panel-close-icon" aria-hidden="true">
                  <span className="studio-panel-close-line" />
                  <span className="studio-panel-close-line" />
                </span>
              </button>
            </div>
            <p className="studio-modal-copy">
              Choose an image file from your device for the selected{" "}
              {uploadTarget?.kind === "backgroundImage"
                ? "background."
                : "screen."}
            </p>
            <div className="studio-modal-upload-wrap">
              <label
                className="studio-modal-upload-button"
                htmlFor="studio-upload-file-input"
              >
                Choose file
              </label>
              <input
                id="studio-upload-file-input"
                type="file"
                accept="image/*"
                onChange={onFileChange}
                className="studio-modal-file-input-hidden"
              />
            </div>
          </div>
        </div>
      ) : null}

      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-[-10000px] top-0"
      >
        {assets.map((asset) => (
          <div
            key={asset.id}
            ref={(node) => {
              exportRefs.current[asset.id] = node;
            }}
          >
            <IosStoreCanvas asset={asset} />
          </div>
        ))}
      </div>
    </main>
  );
}
