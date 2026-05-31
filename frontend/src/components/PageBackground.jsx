// Drop the matching JPG into frontend/public/ to change a page's background.
// The overlay darkness is shared with HomePage — edit bg-black/45 here to tune all pages at once.
export default function PageBackground({ src }) {
  if (!src) return null;
  return (
    <>
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: `url(${src})` }}
      />
      <div className="fixed inset-0 -z-10 bg-black/45" />
    </>
  );
}
