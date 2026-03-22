/**
 * Spinner — standardowy wskaźnik ładowania
 *
 * Użycie:
 *   <Spinner />                    — średni, kolor akcentu
 *   <Spinner size="sm" />          — mały (w przyciskach)
 *   <Spinner size="lg" />          — duży (pełne okno)
 *   <Spinner.Page />               — centrowany na całej stronie
 */

type SpinnerSize = "sm" | "md" | "lg";

const SIZE_PX: Record<SpinnerSize, number> = { sm: 14, md: 20, lg: 32 };
const BORDER_PX: Record<SpinnerSize, number> = { sm: 2, md: 2, lg: 3 };

export function Spinner({ size = "md", color = "var(--accent)" }: { size?: SpinnerSize; color?: string }) {
  const px = SIZE_PX[size];
  const border = BORDER_PX[size];
  return (
    <div
      style={{
        width: px,
        height: px,
        borderWidth: border,
        borderStyle: 'solid',
        borderColor: `${color}33`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

Spinner.Page = function SpinnerPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200 }}>
      <Spinner size="lg" />
    </div>
  );
};
