/**
 * A template (unlike a layout) is drawn again on every page change. The wrapper gives each page a short
 * fade-in on a phone (see `.page-in` in globals.css), so moving between pages feels like moving between
 * screens of an app. It changes nothing on a computer.
 */
export default function ShopTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
