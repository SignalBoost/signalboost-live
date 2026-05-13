export default function SettingsPage() {
  return (
    <div className="space-y-8">
      {/* Page title */}
      <h1 className="text-3xl font-bold text-gray-800">Settings</h1>

      {/* Profile settings */}
      <div className="card">
        <h2 className="text-xl mb-4">Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
            <input
              type="text"
              placeholder="Your name"
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              placeholder="user@example.com"
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
            />
          </div>
          <button className="btn-primary">Save Changes</button>
        </div>
      </div>

      {/* Tier upgrade */}
      <div className="card">
        <h2 className="text-xl mb-4">Upgrade Plan</h2>
        <p className="text-gray-600 mb-4">
          Unlock more credits and advanced features by upgrading your plan.
        </p>
        <button className="btn-primary">Buy Premium</button>
      </div>
    </div>
  );
}
