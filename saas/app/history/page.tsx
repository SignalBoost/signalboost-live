export default function HistoryPage() {
  return (
    <div className="space-y-8">
      {/* Page title */}
      <h1 className="text-3xl font-bold text-gray-800">History</h1>

      {/* History list */}
      <div className="card">
        <h2 className="text-xl mb-4">Recent Generations</h2>
        <ul className="space-y-4">
          <li className="flex justify-between items-center border-b pb-2">
            <span className="text-gray-700">Video: Product Demo</span>
            <span className="text-sm text-gray-500">May 12, 2026</span>
          </li>
          <li className="flex justify-between items-center border-b pb-2">
            <span className="text-gray-700">Video: Welcome Message</span>
            <span className="text-sm text-gray-500">May 11, 2026</span>
          </li>
          <li className="flex justify-between items-center">
            <span className="text-gray-700">Video: Tutorial Series</span>
            <span className="text-sm text-gray-500">May 10, 2026</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
