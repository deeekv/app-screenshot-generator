"use client";

import {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toBlob } from "html-to-image";
import { IosStoreCanvas } from "@/components/ios-store-canvas";
import {
  IOS_5_5_TEMPLATE,
  IOS_TEMPLATE,
  defaultIosAssetState,
  type IosAssetState,
  type IosTemplate,
} from "@/lib/ios-template";

type AssetItem = IosAssetState & {
  id: string;
};

type ColorKey = "titleColor" | "baseColor" | "glowColor";
type UploadTarget = {
  assetId: string;
  kind: "screenshot" | "backgroundImage";
};

type BackgroundCropDraft = {
  positionX: number;
  positionY: number;
  zoom: number;
};

type BackgroundStyle = Pick<
  IosAssetState,
  | "backgroundMode"
  | "baseColor"
  | "glowColor"
  | "backgroundImageSrc"
  | "backgroundImageName"
  | "backgroundImagePositionX"
  | "backgroundImagePositionY"
  | "backgroundImageZoom"
>;

type CropViewportSize = {
  width: number;
  height: number;
};

type HistoryState = {
  past: AssetItem[][];
  present: AssetItem[];
  future: AssetItem[][];
};

const MIN_BACKGROUND_ZOOM = 1;
const MAX_BACKGROUND_ZOOM = 3;
const BACKGROUND_STYLE_KEYS = new Set<keyof IosAssetState>([
  "backgroundMode",
  "baseColor",
  "glowColor",
  "backgroundImageSrc",
  "backgroundImageName",
  "backgroundImagePositionX",
  "backgroundImagePositionY",
  "backgroundImageZoom",
]);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getBackgroundStyle(asset: IosAssetState): BackgroundStyle {
  return {
    backgroundMode: asset.backgroundMode,
    baseColor: asset.baseColor,
    glowColor: asset.glowColor,
    backgroundImageSrc: asset.backgroundImageSrc,
    backgroundImageName: asset.backgroundImageName,
    backgroundImagePositionX: asset.backgroundImagePositionX,
    backgroundImagePositionY: asset.backgroundImagePositionY,
    backgroundImageZoom: asset.backgroundImageZoom,
  };
}

const DEFAULT_SCREEN_TITLES = [
  defaultIosAssetState.title,
  "View the\nevent schedule",
  "View all\nsession details",
] as const;

function createAsset(id: string, title = defaultIosAssetState.title): AssetItem {
  return {
    ...defaultIosAssetState,
    id,
    title,
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
  const idSeedRef = useRef(DEFAULT_SCREEN_TITLES.length + 1);
  const exportRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previewTileRef = useRef<HTMLDivElement>(null);
  const preview55TileRef = useRef<HTMLDivElement>(null);
  const cropViewportRef = useRef<HTMLDivElement>(null);
  const cropDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPositionX: number;
    startPositionY: number;
    horizontalTravel: number;
    verticalTravel: number;
  } | null>(null);

  const [history, setHistory] = useState<HistoryState>(() => ({
    past: [],
    present: DEFAULT_SCREEN_TITLES.map((title, index) =>
      createAsset(`asset-${index + 1}`, title),
    ),
    future: [],
  }));
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [previewPanelSelected, setPreviewPanelSelected] = useState(true);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [keepBackgroundsSynced, setKeepBackgroundsSynced] = useState(false);
  const [cropAssetId, setCropAssetId] = useState<string | null>(null);
  const [cropDraft, setCropDraft] = useState<BackgroundCropDraft>({
    positionX: 0,
    positionY: 0,
    zoom: 1,
  });
  const [cropImageDimensions, setCropImageDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [cropViewportSize, setCropViewportSize] = useState<CropViewportSize>({
    width: 0,
    height: 0,
  });
  const [isAddHoverVisible, setIsAddHoverVisible] = useState(false);
  const [previewScale, setPreviewScale] = useState<number>(
    IOS_TEMPLATE.previewScale,
  );
  const [preview55Scale, setPreview55Scale] = useState<number>(
    IOS_5_5_TEMPLATE.previewScale,
  );
  const [activeDeviceSlug, setActiveDeviceSlug] = useState<string>(
    IOS_TEMPLATE.deviceSlug,
  );
  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(1);
  const [isGuideVisible, setIsGuideVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pendingUploadName, setPendingUploadName] = useState<string | null>(null);
  const [editingTitleAssetId, setEditingTitleAssetId] = useState<string | null>(
    null,
  );
  const [titleDraft, setTitleDraft] = useState("");
  const [titleSelectionStart, setTitleSelectionStart] = useState(0);
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

  const activeTemplate =
    activeDeviceSlug === IOS_5_5_TEMPLATE.deviceSlug
      ? IOS_5_5_TEMPLATE
      : IOS_TEMPLATE;

  const cropAsset = useMemo(
    () => assets.find((asset) => asset.id === cropAssetId) ?? null,
    [assets, cropAssetId],
  );

  const cropGeometry = useMemo(() => {
    if (
      !cropViewportSize.width ||
      !cropViewportSize.height ||
      !cropImageDimensions.width ||
      !cropImageDimensions.height
    ) {
      return null;
    }

    const frameScale = Math.min(
      (cropViewportSize.height - 2) / activeTemplate.stage.height,
      (cropViewportSize.width * 0.55) / activeTemplate.stage.width,
    );
    const frameWidth = activeTemplate.stage.width * frameScale;
    const frameHeight = activeTemplate.stage.height * frameScale;
    const coverScale = Math.max(
      frameWidth / cropImageDimensions.width,
      frameHeight / cropImageDimensions.height,
    );
    const renderedWidth =
      cropImageDimensions.width * coverScale * cropDraft.zoom;
    const renderedHeight =
      cropImageDimensions.height * coverScale * cropDraft.zoom;
    const horizontalTravel = Math.max(0, (renderedWidth - frameWidth) / 2);
    const verticalTravel = Math.max(0, (renderedHeight - frameHeight) / 2);

    return {
      frameLeft: (cropViewportSize.width - frameWidth) / 2,
      frameTop: (cropViewportSize.height - frameHeight) / 2,
      frameWidth,
      frameHeight,
      renderedWidth,
      renderedHeight,
      imageCenterX:
        cropViewportSize.width / 2 + cropDraft.positionX * horizontalTravel,
      imageCenterY:
        cropViewportSize.height / 2 + cropDraft.positionY * verticalTravel,
      horizontalTravel,
      verticalTravel,
    };
  }, [
    activeTemplate,
    cropDraft,
    cropImageDimensions,
    cropViewportSize,
  ]);

  function exportBaseName(template: IosTemplate) {
    return [slugify(exportProjectName), template.deviceSlug].filter(Boolean).join("-");
  }

  function renderDeviceMenu() {
    const devices = [IOS_TEMPLATE, IOS_5_5_TEMPLATE];
    const activeDevice = devices.find(
      (device) => device.deviceSlug === activeDeviceSlug,
    )!;

    return (
      <div className="studio-device-menu studio-nav-device-menu">
        <button
          type="button"
          className={`studio-nav-device-trigger ${
            isGuideVisible && guideStep === 4 ? "studio-onboarding-device" : ""
          }`}
          aria-haspopup="menu"
          aria-expanded={isDeviceMenuOpen}
          onClick={(event) => {
            event.stopPropagation();
            setIsDeviceMenuOpen((current) => !current);
          }}
        >
          <span>{activeDevice.deviceLabel.replace("iOS ", "iOS (") + ")"}</span>
          <img
            src="/assets/icon-chevron-down-medium.svg"
            alt=""
            aria-hidden="true"
            className={`studio-preview-device-chevron ${
              isDeviceMenuOpen ? "studio-preview-device-chevron-open" : ""
            }`}
          />
        </button>
        {isDeviceMenuOpen ? (
          <div className="studio-device-menu-content" role="menu">
            {devices.map((device) => {
              const isActive = device.deviceSlug === activeDeviceSlug;
              return (
                <button
                  key={device.deviceSlug}
                  type="button"
                  className={`studio-device-menu-item ${
                    isActive ? "studio-device-menu-item-active" : ""
                  }`}
                  role="menuitemradio"
                  aria-checked={isActive}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveDeviceSlug(device.deviceSlug);
                    setIsDeviceMenuOpen(false);
                    if (guideStep === 4) {
                      dismissGuide();
                    }
                  }}
                >
                  <span>{device.deviceLabel.replace("iOS ", "iOS (") + ")"}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

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
    setIsGuideVisible(
      window.localStorage.getItem("studio-guide-background-v1-dismissed") !==
        "true",
    );
  }, []);

  function dismissGuide() {
    setIsGuideVisible(false);
    window.localStorage.setItem("studio-guide-background-v1-dismissed", "true");
  }

  useEffect(() => {
    function closeDeviceMenu(event: MouseEvent) {
      if (!(event.target as HTMLElement).closest(".studio-device-menu")) {
        setIsDeviceMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDeviceMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeDeviceMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeDeviceMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    const previews = [
      [previewTileRef.current, IOS_TEMPLATE, setPreviewScale],
      [preview55TileRef.current, IOS_5_5_TEMPLATE, setPreview55Scale],
    ] as const;
    const observers = previews.flatMap(([element, template, setScale]) => {
      if (!element) return [];
      const updateScale = () => {
        const width = element.getBoundingClientRect().width;
        if (width) setScale(width / template.exportWidth);
      };
      updateScale();
      const observer = new ResizeObserver(updateScale);
      observer.observe(element);
      return [observer];
    });

    return () => observers.forEach((observer) => observer.disconnect());
  }, []);

  useEffect(() => {
    const viewport = cropViewportRef.current;
    if (!viewport || !cropAssetId) {
      return;
    }

    const updateSize = () => {
      const bounds = viewport.getBoundingClientRect();
      setCropViewportSize({ width: bounds.width, height: bounds.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [cropAssetId]);

  useEffect(() => {
    if (!cropAssetId) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCropAssetId(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [cropAssetId]);

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
    const shouldSyncBackground =
      keepBackgroundsSynced && BACKGROUND_STYLE_KEYS.has(key);
    commitAssets((current) =>
      current.map((asset) =>
        shouldSyncBackground || asset.id === assetId
          ? { ...asset, [key]: value }
          : asset,
      ),
    );
    if (guideStep === 2 && BACKGROUND_STYLE_KEYS.has(key)) {
      setGuideStep(3);
    }
  }

  function updateBackgroundStyle(
    assetId: string,
    patch: Partial<BackgroundStyle>,
  ) {
    commitAssets((current) =>
      current.map((asset) =>
        keepBackgroundsSynced || asset.id === assetId
          ? { ...asset, ...patch }
          : asset,
      ),
    );
    if (guideStep === 2) {
      setGuideStep(3);
    }
  }

  function toggleBackgroundSync() {
    const nextSyncState = !keepBackgroundsSynced;
    if (nextSyncState && editableAsset) {
      const sharedBackground = getBackgroundStyle(editableAsset);
      commitAssets((current) =>
        current.map((asset) => ({ ...asset, ...sharedBackground })),
      );
    }
    setKeepBackgroundsSynced(nextSyncState);
    if (guideStep === 2) {
      setGuideStep(3);
    }
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
    if (guideStep === 1) {
      setGuideStep(2);
    }
  }

  function addAsset() {
    const newAsset = createAsset(nextId());
    if (keepBackgroundsSynced && assets[0]) {
      Object.assign(newAsset, getBackgroundStyle(assets[0]));
    }
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
    if (guideStep === 3) {
      setGuideStep(4);
    }
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

  function openBackgroundCrop(asset: AssetItem) {
    if (!asset.backgroundImageSrc) {
      return;
    }

    setCropDraft({
      positionX: asset.backgroundImagePositionX,
      positionY: asset.backgroundImagePositionY,
      zoom: asset.backgroundImageZoom,
    });
    setCropImageDimensions({ width: 0, height: 0 });
    setCropAssetId(asset.id);
  }

  function closeBackgroundCrop() {
    cropDragRef.current = null;
    setCropAssetId(null);
  }

  function updateCropZoom(nextZoom: number) {
    setCropDraft((current) => ({
      ...current,
      zoom: clamp(nextZoom, MIN_BACKGROUND_ZOOM, MAX_BACKGROUND_ZOOM),
    }));
  }

  function resetBackgroundCrop() {
    setCropDraft({ positionX: 0, positionY: 0, zoom: 1 });
  }

  function applyBackgroundCrop() {
    if (!cropAssetId) {
      return;
    }

    updateBackgroundStyle(cropAssetId, {
      backgroundImagePositionX: cropDraft.positionX,
      backgroundImagePositionY: cropDraft.positionY,
      backgroundImageZoom: cropDraft.zoom,
    });
    closeBackgroundCrop();
  }

  function handleCropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!cropGeometry) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPositionX: cropDraft.positionX,
      startPositionY: cropDraft.positionY,
      horizontalTravel: cropGeometry.horizontalTravel,
      verticalTravel: cropGeometry.verticalTravel,
    };
  }

  function handleCropPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const horizontalDelta = event.clientX - drag.startClientX;
    const verticalDelta = event.clientY - drag.startClientY;
    setCropDraft((current) => ({
      ...current,
      positionX: drag.horizontalTravel
        ? clamp(
            drag.startPositionX + horizontalDelta / drag.horizontalTravel,
            -1,
            1,
          )
        : 0,
      positionY: drag.verticalTravel
        ? clamp(
            drag.startPositionY + verticalDelta / drag.verticalTravel,
            -1,
            1,
          )
        : 0,
    }));
  }

  function handleCropPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (cropDragRef.current?.pointerId === event.pointerId) {
      cropDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }

  function handleCropKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.12 : 0.04;
    let movementX = 0;
    let movementY = 0;

    if (event.key === "ArrowLeft") movementX = -step;
    if (event.key === "ArrowRight") movementX = step;
    if (event.key === "ArrowUp") movementY = -step;
    if (event.key === "ArrowDown") movementY = step;
    if (!movementX && !movementY) {
      return;
    }

    event.preventDefault();
    setCropDraft((current) => ({
      ...current,
      positionX: clamp(current.positionX + movementX, -1, 1),
      positionY: clamp(current.positionY + movementY, -1, 1),
    }));
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !uploadTarget) {
      return;
    }

    setPendingUploadName(file.name);

    try {
      const dataUrl = await fileToDataUrl(file);

      if (uploadTarget.kind === "backgroundImage") {
        updateBackgroundStyle(uploadTarget.assetId, {
          backgroundMode: "image",
          backgroundImageSrc: dataUrl,
          backgroundImageName: file.name,
          backgroundImagePositionX: 0,
          backgroundImagePositionY: 0,
          backgroundImageZoom: 1,
        });
      } else {
        commitAssets((current) =>
          current.map((asset) =>
            asset.id === uploadTarget.assetId
              ? {
                  ...asset,
                  screenshotSrc: dataUrl,
                  screenshotName: file.name,
                }
              : asset,
          ),
        );
      }
      setSelectedAssetIds([uploadTarget.assetId]);
      setPreviewPanelSelected(false);
      if (uploadTarget.kind === "backgroundImage") {
        setCropDraft({ positionX: 0, positionY: 0, zoom: 1 });
        setCropImageDimensions({ width: 0, height: 0 });
        setCropAssetId(uploadTarget.assetId);
      }
      closeUploadModal();
    } catch (error) {
      console.error("File upload failed", error);
    } finally {
      event.target.value = "";
    }
  }

  function startInlineTitleEdit(
    assetId: string,
    currentTitle: string,
    selectionStart: number,
  ) {
    setSelectedAssetIds([assetId]);
    setPreviewPanelSelected(false);
    setEditingTitleAssetId(assetId);
    setTitleDraft(currentTitle);
    setTitleSelectionStart(selectionStart);
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
    updateAsset(assetId, "backgroundMode", mode);
  }

  function clearBackgroundImage(assetId: string) {
    updateBackgroundStyle(assetId, {
      backgroundMode: "gradient",
      backgroundImageSrc: null,
      backgroundImageName: null,
      backgroundImagePositionX: 0,
      backgroundImagePositionY: 0,
      backgroundImageZoom: 1,
    });
    if (cropAssetId === assetId) {
      closeBackgroundCrop();
    }
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
    template: IosTemplate,
  ) {
    const node = exportRefs.current[`${template.deviceSlug}:${assetId}`];
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
      width: template.exportWidth,
      height: template.exportHeight,
    });

    if (!blob) {
      return null;
    }

    const filename =
      mode === "all"
        ? `${exportBaseName(template)}-screen-${String(assetIndex).padStart(2, "0")}.png`
        : `${exportBaseName(template)}-selected-${String(assetIndex).padStart(2, "0")}.png`;

    return {
      blob,
      bytes: new Uint8Array(await blob.arrayBuffer()),
      filename,
    };
  }

  async function exportAssetIds(
    assetIds: string[],
    mode: "selected" | "all",
    template: IosTemplate,
  ) {
    if (!assetIds.length) {
      return;
    }

    setIsExporting(true);

    try {
      const renderedAssets = (
        await Promise.all(
          assetIds.map((assetId) => renderAssetExport(assetId, mode, template)),
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
        downloadBlob(zipBlob, `${exportBaseName(template)}-screens.zip`);
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
          {renderDeviceMenu()}
        </header>

        <section className="studio-workspace">
          {isGuideVisible ? (
            <aside className="studio-get-started" aria-label="Get started guide">
              <div className="studio-get-started-header">
                <div>
                  <p className="studio-get-started-eyebrow">Get started</p>
                  <p className="studio-get-started-progress">Step {guideStep} of 4</p>
                </div>
                <button
                  type="button"
                  className="studio-get-started-close"
                  onClick={dismissGuide}
                  aria-label="Dismiss getting started guide"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <p className="studio-get-started-copy">
                {guideStep === 1
                  ? "Select a screen to open its design controls."
                  : guideStep === 2
                    ? "Configure its background. Turn sync on only when every screen should match."
                    : guideStep === 3
                      ? "Duplicate the screen to carry its design into a new one."
                      : "Switch device sizes from the menu in the top-right."}
              </p>
              <div className="studio-get-started-steps" aria-hidden="true">
                {[1, 2, 3, 4].map((step) => (
                  <span
                    key={step}
                    className={step <= guideStep ? "studio-get-started-step-active" : ""}
                  />
                ))}
              </div>
            </aside>
          ) : null}
          <div className="studio-grid">
            {sidePanelOpen ? (
              <>
              <button
                type="button"
                className="studio-mobile-drawer-backdrop"
                onClick={closeSidePanel}
                aria-label="Close edit asset panel"
              />
              <aside
                className="studio-panel studio-side-menu"
                role="dialog"
                aria-modal="true"
                aria-label="Edit asset"
              >
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

                    <div
                      className={`studio-mode-panel ${
                        isGuideVisible && guideStep === 2
                          ? "studio-onboarding-background"
                          : ""
                      }`}
                    >
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
                          <div className="studio-background-image-controls">
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

                            {editableAsset!.backgroundImageSrc ? (
                              <button
                                type="button"
                                className="studio-adjust-crop-button"
                                onClick={() => openBackgroundCrop(editableAsset!)}
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 20 20"
                                  fill="none"
                                >
                                  <path d="M6 2.5v11a.5.5 0 0 0 .5.5h11" />
                                  <path d="M2.5 6H14a.5.5 0 0 1 .5.5.5V18" />
                                </svg>
                                Adjust crop
                              </button>
                            ) : null}
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

                      <div className="studio-background-sync-row">
                        <span className="studio-background-sync-copy">
                          <span className="studio-background-sync-title">
                            Keep backgrounds synced
                          </span>
                          <button
                            type="button"
                            className="studio-background-sync-info"
                            data-tooltip={
                              keepBackgroundsSynced
                                ? "Background changes apply to all screens, including new ones."
                                : "Use this background on all screens, including new ones."
                            }
                            aria-label={
                              keepBackgroundsSynced
                                ? "Background sync on. Changes apply to all screens."
                                : "Background sync off. Turn on to apply changes to all screens."
                            }
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 16 16"
                              fill="none"
                            >
                              <circle cx="8" cy="8" r="6.25" />
                              <path d="M8 7.25v3.5" />
                              <path d="M8 5.15h.01" />
                            </svg>
                          </button>
                        </span>
                        <button
                          type="button"
                          className={`studio-sync-switch ${
                            keepBackgroundsSynced
                              ? "studio-sync-switch-on"
                              : ""
                          }`}
                          role="switch"
                          aria-checked={keepBackgroundsSynced}
                          aria-label="Keep backgrounds synced"
                          onClick={toggleBackgroundSync}
                        >
                          <span className="studio-sync-switch-thumb" />
                        </button>
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
                        className={`studio-icon-button ${
                          isGuideVisible && guideStep === 3
                            ? "studio-onboarding-duplicate"
                            : ""
                        }`}
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
              </>
            ) : null}

              <section
              className={`studio-panel studio-preview-panel ${
                sidePanelOpen ? "" : "studio-preview-panel-full"
              } ${previewPanelSelected ? "studio-preview-panel-selected" : ""}`}
              onClick={selectPreviewPanel}
              hidden={activeDeviceSlug !== IOS_TEMPLATE.deviceSlug}
            >
              <div className="studio-preview-toolbar">
                <div className="studio-preview-title-stack">
                  <p className="studio-preview-eyebrow">Preview</p>
                  <h2 className="studio-preview-title">
                    {IOS_TEMPLATE.deviceLabel.replace("iOS ", "iOS (") + ")"}
                  </h2>
                </div>

                <div className="studio-preview-actions">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void exportAssetIds(selectedAssetIds, "selected", IOS_TEMPLATE);
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
                        IOS_TEMPLATE,
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
                    className={`studio-asset-rail ${
                      isGuideVisible && guideStep === 1 ? "studio-asset-rail-onboarding-screen" : ""
                    }`}
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
                            } ${
                              isGuideVisible && guideStep === 1 && index === 0
                                ? "studio-onboarding-screen"
                                : ""
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
                                  className={`studio-icon-plain-button ${
                                    isGuideVisible && guideStep === 3 && isSelected
                                      ? "studio-onboarding-duplicate"
                                      : ""
                                  }`}
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
                                template={IOS_TEMPLATE}
                                interactive
                                scale={previewScale}
                                isTitleEditing={editingTitleAssetId === asset.id}
                                titleDraft={
                                  editingTitleAssetId === asset.id
                                    ? titleDraft
                                    : undefined
                                }
                                titleSelectionStart={titleSelectionStart}
                                onTitleClick={(selectionStart) =>
                                  startInlineTitleEdit(
                                    asset.id,
                                    asset.title,
                                    selectionStart,
                                  )
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

            <section
              className={`studio-panel studio-preview-panel studio-preview-panel-5-5 ${
                sidePanelOpen ? "studio-preview-panel-below" : "studio-preview-panel-full"
              } ${previewPanelSelected ? "studio-preview-panel-selected" : ""}`}
              onClick={selectPreviewPanel}
              hidden={activeDeviceSlug !== IOS_5_5_TEMPLATE.deviceSlug}
            >
              <div className="studio-preview-toolbar">
                <div className="studio-preview-title-stack">
                  <p className="studio-preview-eyebrow">Preview</p>
                  <h2 className="studio-preview-title">
                    {IOS_5_5_TEMPLATE.deviceLabel.replace("iOS ", "iOS (") + ")"}
                  </h2>
                </div>

                <div className="studio-preview-actions">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void exportAssetIds(
                        selectedAssetIds,
                        "selected",
                        IOS_5_5_TEMPLATE,
                      );
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
                        IOS_5_5_TEMPLATE,
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
                    className={`studio-asset-rail ${
                      isGuideVisible && guideStep === 1 ? "studio-asset-rail-onboarding-screen" : ""
                    }`}
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
                            } ${
                              isGuideVisible && guideStep === 1 && index === 0
                                ? "studio-onboarding-screen"
                                : ""
                            }`}
                          >
                            <div className="studio-preview-card-header">
                              <span className="studio-preview-card-name">Screen {index + 1}</span>
                              <div className="studio-card-actions">
                                <button
                                  type="button"
                                  className="studio-icon-plain-button studio-icon-button-danger"
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
                                  className={`studio-icon-plain-button ${
                                    isGuideVisible && guideStep === 3 && isSelected
                                      ? "studio-onboarding-duplicate"
                                      : ""
                                  }`}
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
                              ref={index === 0 ? preview55TileRef : undefined}
                              className="studio-preview-canvas-shell studio-preview-canvas-shell-5-5"
                            >
                              <IosStoreCanvas
                                asset={asset}
                                template={IOS_5_5_TEMPLATE}
                                interactive
                                scale={preview55Scale}
                                isTitleEditing={editingTitleAssetId === asset.id}
                                titleDraft={
                                  editingTitleAssetId === asset.id ? titleDraft : undefined
                                }
                                titleSelectionStart={titleSelectionStart}
                                onTitleClick={(selectionStart) =>
                                  startInlineTitleEdit(
                                    asset.id,
                                  asset.title,
                                  selectionStart,
                                )
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
                              onMouseEnter={() => setIsAddHoverVisible(true)}
                              onMouseLeave={() => setIsAddHoverVisible(false)}
                            >
                              <button
                                type="button"
                                className="studio-add-connector studio-add-connector-5-5"
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
                                  <div className="studio-placeholder-canvas-shell studio-placeholder-canvas-shell-5-5" />
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

      {cropAsset?.backgroundImageSrc ? (
        <div className="studio-modal-backdrop studio-crop-backdrop" onClick={closeBackgroundCrop}>
          <div
            className="studio-crop-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-crop-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="studio-modal-header">
              <div>
                <h3 className="studio-modal-title" id="studio-crop-title">
                  Adjust background image
                </h3>
                <p className="studio-crop-subtitle">
                  Position the image for {activeTemplate.deviceLabel}.
                </p>
              </div>
              <button
                type="button"
                className="studio-modal-close"
                onClick={closeBackgroundCrop}
                aria-label="Close crop editor"
              >
                <span className="studio-panel-close-icon" aria-hidden="true">
                  <span className="studio-panel-close-line" />
                  <span className="studio-panel-close-line" />
                </span>
              </button>
            </div>

            <div
              ref={cropViewportRef}
              className={`studio-crop-viewport ${
                cropDragRef.current ? "studio-crop-viewport-dragging" : ""
              }`}
              role="application"
              tabIndex={0}
              aria-label="Background image crop area"
              aria-describedby="studio-crop-help"
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerEnd}
              onPointerCancel={handleCropPointerEnd}
              onLostPointerCapture={() => {
                cropDragRef.current = null;
              }}
              onKeyDown={handleCropKeyDown}
            >
              <img
                key={cropAsset.backgroundImageSrc}
                src={cropAsset.backgroundImageSrc}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="studio-crop-source-image"
                onLoad={(event) => {
                  setCropImageDimensions({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                }}
                style={
                  cropGeometry
                    ? {
                        left: cropGeometry.imageCenterX,
                        top: cropGeometry.imageCenterY,
                        width: cropGeometry.renderedWidth,
                        height: cropGeometry.renderedHeight,
                      }
                    : undefined
                }
              />

              {cropGeometry ? (
                <div
                  className="studio-crop-frame"
                  style={{
                    left: cropGeometry.frameLeft,
                    top: cropGeometry.frameTop,
                    width: cropGeometry.frameWidth,
                    height: cropGeometry.frameHeight,
                  }}
                >
                  <div className="studio-crop-drag-hint" id="studio-crop-help">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2v20M2 12h20M12 2 9 5m3-3 3 3M12 22l-3-3m3 3 3-3M2 12l3-3m-3 3 3 3M22 12l-3-3m3 3-3 3" />
                    </svg>
                    <span>Drag image to reposition</span>
                  </div>
                </div>
              ) : (
                <div className="studio-crop-loading">Preparing image…</div>
              )}
            </div>

            <div className="studio-crop-controls">
              <span className="studio-crop-control-label">Zoom</span>
              <button
                type="button"
                className="studio-crop-stepper"
                onClick={() => updateCropZoom(cropDraft.zoom - 0.1)}
                aria-label="Zoom out"
                disabled={cropDraft.zoom <= MIN_BACKGROUND_ZOOM}
              >
                −
              </button>
              <input
                className="studio-crop-range"
                type="range"
                min={MIN_BACKGROUND_ZOOM}
                max={MAX_BACKGROUND_ZOOM}
                step={0.01}
                value={cropDraft.zoom}
                onChange={(event) => updateCropZoom(Number(event.target.value))}
                aria-label="Background image zoom"
              />
              <button
                type="button"
                className="studio-crop-stepper"
                onClick={() => updateCropZoom(cropDraft.zoom + 0.1)}
                aria-label="Zoom in"
                disabled={cropDraft.zoom >= MAX_BACKGROUND_ZOOM}
              >
                +
              </button>
              <output className="studio-crop-zoom-value">
                {Math.round(cropDraft.zoom * 100)}%
              </output>
            </div>

            <div className="studio-crop-footer">
              <button
                type="button"
                className="studio-crop-reset"
                onClick={resetBackgroundCrop}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                  <path d="M4.1 6.7A6.5 6.5 0 1 1 3.5 12" />
                  <path d="M4 3v4h4" />
                </svg>
                Reset
              </button>
              <div className="studio-crop-actions">
                <button
                  type="button"
                  className="studio-button studio-button-secondary"
                  onClick={closeBackgroundCrop}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="studio-button studio-button-primary"
                  onClick={applyBackgroundCrop}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
            key={`${IOS_TEMPLATE.deviceSlug}:${asset.id}`}
            ref={(node) => {
              exportRefs.current[`${IOS_TEMPLATE.deviceSlug}:${asset.id}`] = node;
            }}
          >
            <IosStoreCanvas asset={asset} />
          </div>
        ))}
        {assets.map((asset) => (
          <div
            key={`${IOS_5_5_TEMPLATE.deviceSlug}:${asset.id}`}
            ref={(node) => {
              exportRefs.current[`${IOS_5_5_TEMPLATE.deviceSlug}:${asset.id}`] = node;
            }}
          >
            <IosStoreCanvas asset={asset} template={IOS_5_5_TEMPLATE} />
          </div>
        ))}
      </div>
    </main>
  );
}
