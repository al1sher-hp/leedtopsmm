export default function Pagination({ pagination, onPageChange }) {
  if (!pagination) return null;
  const { page, totalPages } = pagination;

  return (
    <div className="flex items-center justify-center gap-3 py-4">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm disabled:opacity-40"
      >
        Oldingi
      </button>
      <span className="text-sm text-gray-500">
        {page} / {totalPages || 1}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm disabled:opacity-40"
      >
        Keyingi
      </button>
    </div>
  );
}
