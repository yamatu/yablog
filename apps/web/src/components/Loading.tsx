export function LoadingSpinner({ size = 30 }: { size?: number }) {
  return <div className="loadingSpinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function LoadingCenter({
  label = "加载中…",
  minHeight = 180,
}: {
  label?: string;
  minHeight?: number;
}) {
  return (
    <div className="loadingCenter" style={{ minHeight }}>
      <LoadingSpinner />
      <div className="muted" style={{ marginTop: 10 }}>
        {label}
      </div>
    </div>
  );
}

export function LoadingOverlay({ show, label = "加载中…" }: { show: boolean; label?: string }) {
  if (!show) return null;
  return (
    <div className="loadingOverlay" aria-hidden="true">
      <div className="loadingOverlayInner">
        <LoadingSpinner size={28} />
        <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

