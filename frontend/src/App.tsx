import './App.css'

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navbar */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-blue-600">SmartChain</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Warehouse Dashboard</span>
            <button className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition">
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-semibold text-gray-800 mb-6">
          Inventory Overview
        </h2>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
            <p className="text-sm text-gray-500">Total Products</p>
            <p className="text-3xl font-bold text-gray-800 mt-2">248</p>
          </div>
          <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
            <p className="text-sm text-gray-500">Low Stock Alerts</p>
            <p className="text-3xl font-bold text-red-500 mt-2">7</p>
          </div>
          <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
            <p className="text-sm text-gray-500">Pending Shipments</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">12</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-100 text-gray-600 text-sm">
              <tr>
                <th className="px-6 py-3">Product</th>
                <th className="px-6 py-3">SKU</th>
                <th className="px-6 py-3">Quantity</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              <tr className="border-t border-gray-100">
                <td className="px-6 py-4">Wireless Mouse</td>
                <td className="px-6 py-4">SKU-1023</td>
                <td className="px-6 py-4">54</td>
                <td className="px-6 py-4">
                  <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
                    In Stock
                  </span>
                </td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="px-6 py-4">USB-C Cable</td>
                <td className="px-6 py-4">SKU-1024</td>
                <td className="px-6 py-4">4</td>
                <td className="px-6 py-4">
                  <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full">
                    Low Stock
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

export default App;
