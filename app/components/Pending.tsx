/** Shimmering block the size of `placeholder`, for a value that's still being read. */
export function Pending({ placeholder }: { placeholder: string }) {
  return (
    <>
      <span className="skeleton-inline" aria-hidden="true">
        {placeholder}
      </span>
      <span className="sr-only">loading</span>
    </>
  );
}
