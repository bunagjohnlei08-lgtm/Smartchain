import React, { useState } from 'react';

import {

  ChevronRight,

  Plus,

  Search,

  ChevronDown,

  Printer,

  Edit,

  Trash2,

  ArrowLeft,

  QrCode,

  Package,

  MoreHorizontal

} from 'lucide-react';



// Types

interface Product {

  sku: string;

  name: string;

  category: string;

  brand: string;

  tracking: 'SERIAL' | 'BATCH' | 'NONE';

  costPrice: number;

  unitPrice: number;

  unit: string;

  reorderLimit: number;

  stock: number;

  status: 'Healthy' | 'Low Stock' | 'Critical' | 'Out of Stock';

  lastUpdated: string;

}



// Mock Product Data with enhanced fields

const productData: Product[] = [

  {

    sku: 'SKU-IPAD-AIRRR',

    name: 'IPAD AIR 1 variants',

    category: 'Electronics',

    brand: 'Sony',

    tracking: 'SERIAL',

    costPrice: 10000,

    unitPrice: 10000,

    unit: 'pcs',

    reorderLimit: 97,

    stock: 97,

    status: 'Healthy',

    lastUpdated: '2026-07-25 14:30'

  },

  {

    sku: 'MBP-M3',

    name: 'Macbook Pro M3',

    category: 'Electronics',

    brand: 'Apple',

    tracking: 'SERIAL',

    costPrice: 10000,

    unitPrice: 10000,

    unit: 'pcs',

    reorderLimit: 5,

    stock: 5,

    status: 'Low Stock',

    lastUpdated: '2026-07-25 13:15'

  },

  {

    sku: 'SKU-001',

    name: 'Organic Green Tea',

    category: 'Beverages',

    brand: "Nature's Best",

    tracking: 'BATCH',

    costPrice: 250,

    unitPrice: 350,

    unit: 'box',

    reorderLimit: 100,

    stock: 450,

    status: 'Healthy',

    lastUpdated: '2026-07-24 09:45'

  },

  {

    sku: 'SKU-002',

    name: 'Stainless Steel Bottle',

    category: 'Kitchenware',

    brand: 'EcoLife',

    tracking: 'NONE',

    costPrice: 450,

    unitPrice: 650,

    unit: 'pcs',

    reorderLimit: 150,

    stock: 120,

    status: 'Low Stock',

    lastUpdated: '2026-07-24 11:20'

  }

];



// Status badge component

const CreateProductPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {

  return (

    <div className="flex-1 flex flex-col overflow-hidden">

      <main className="flex-1 overflow-y-auto p-6">

        <button onClick={onBack} className="flex items-center gap-2 text-[#94A3B8] hover:text-white transition-colors mb-6">

          <ArrowLeft className="w-4 h-4" />

          Back to Products

        </button>



        <div className="max-w-4xl">

          <h1 className="text-2xl font-bold text-white mb-6">Create New Product</h1>



          <div className="bg-[#162033] border border-[#263244] rounded-xl p-6">

            <form className="space-y-6">

              <div className="grid grid-cols-2 gap-6">

                <div>

                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#A2AAB8' }}>

                    CATEGORY *

                  </label>

                  <select className="w-full bg-[#091018] border border-[#2A3447] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors">

                    <option>Electronics</option>

                    <option>Beverages</option>

                    <option>Kitchenware</option>

                  </select>

                </div>

                <div>

                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#A2AAB8' }}>

                    BRAND *

                  </label>

                  <select className="w-full bg-[#091018] border border-[#2A3447] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors">

                    <option>Sony</option>

                    <option>Apple</option>

                    <option>Nature's Best</option>

                  </select>

                </div>

              </div>



              <div className="bg-[#091018] border border-[#2A3447] rounded-lg p-4 flex items-center justify-between">

                <div>

                  <p className="text-white font-medium">IPAD AIR (256) SKU-IPAD-AIRRR-256</p>

                  <p className="text-[#94A3B8] text-sm">P10,000.00</p>

                </div>

                <button className="text-blue-400 hover:text-blue-300 transition-colors text-sm">Edit</button>

              </div>



              <div className="grid grid-cols-3 gap-6">

                <div>

                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#A2AAB8' }}>

                    MEASUREMENT UNIT *

                  </label>

                  <select className="w-full bg-[#091018] border border-[#2A3447] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors">

                    <option>pcs</option>

                    <option>box</option>

                    <option>kg</option>

                  </select>

                </div>

                <div>

                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#A2AAB8' }}>

                    REORDER LIMIT QTY *

                  </label>

                  <input

                    type="number"

                    defaultValue="97"

                    className="w-full bg-[#091018] border border-[#2A3447] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"

                  />

                </div>

                <div>

                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#A2AAB8' }}>

                    INVENTORY TRACKING CONTROL *

                  </label>

                  <select className="w-full bg-[#091018] border border-[#2A3447] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors">

                    <option>Unique Serial Number Individual Control</option>

                    <option>Batch Control</option>

                    <option>None</option>

                  </select>

                </div>

              </div>



              <div className="grid grid-cols-2 gap-6">

                <div>

                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#A2AAB8' }}>

                    COST PRICE (₱) *

                  </label>

                  <input

                    type="number"

                    defaultValue="10000.00"

                    step="0.01"

                    className="w-full bg-[#091018] border border-[#2A3447] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"

                  />

                </div>

                <div>

                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#A2AAB8' }}>

                    UNIT PRICE (₱) *

                  </label>

                  <input

                    type="number"

                    defaultValue="10000.00"

                    step="0.01"

                    className="w-full bg-[#091018] border border-[#2A3447] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"

                  />

                </div>

              </div>



              <div>

                <label className="block text-sm font-medium mb-1.5" style={{ color: '#A2AAB8' }}>

                  PRODUCT IDENTIFIERS

                </label>

                <div className="flex items-center gap-4">

                  <div className="flex-1 bg-[#091018] border border-[#2A3447] rounded-lg px-4 py-2 text-sm text-white">

                    SKU-IPAD-AIRRR

                  </div>

                  <button className="flex items-center gap-2 px-4 py-2 border border-[#2A3447] rounded-lg text-[#94A3B8] hover:text-white transition-colors">

                    <Printer className="w-4 h-4" />

                    Print Labels

                  </button>

                  <button className="flex items-center gap-2 px-4 py-2 border border-[#2A3447] rounded-lg text-[#94A3B8] hover:text-white transition-colors">

                    <QrCode className="w-4 h-4" />

                    QR Lookup

                  </button>

                </div>

              </div>



              <div>

                <h4 className="text-white font-medium mb-3">VARIANT</h4>

                <div className="grid grid-cols-3 gap-4 bg-[#091018] border border-[#2A3447] rounded-lg p-4">

                  <div>

                    <label className="block text-xs font-medium mb-1" style={{ color: '#A2AAB8' }}>SKU</label>

                    <input

                      type="text"

                      placeholder="Enter SKU"

                      className="w-full bg-[#0B1220] border border-[#2A3447] rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"

                    />

                  </div>

                  <div>

                    <label className="block text-xs font-medium mb-1" style={{ color: '#A2AAB8' }}>PRICE</label>

                    <input

                      type="number"

                      placeholder="0.00"

                      className="w-full bg-[#0B1220] border border-[#2A3447] rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"

                    />

                  </div>

                  <div className="flex items-end gap-2">

                    <button className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded hover:opacity-90 transition-opacity">

                      Add

                    </button>

                    <button className="px-4 py-1.5 border border-[#2A3447] text-[#94A3B8] text-sm rounded hover:text-white transition-colors">

                      Cancel

                    </button>

                  </div>

                </div>

              </div>



              <div className="flex items-center justify-end gap-4 pt-4 border-t border-[#263244]">

                <button

                  type="button"

                  onClick={onBack}

                  className="px-6 py-2 border border-[#2A3447] rounded-lg text-[#94A3B8] hover:text-white transition-colors"

                >

                  Cancel

                </button>

                <button

                  type="submit"

                  className="px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-90"

                  style={{ backgroundColor: '#5B8CFF', color: '#F5F7FA' }}

                >

                  Save Product

                </button>

              </div>

            </form>

          </div>

        </div>

      </main>

    </div>

  );

};



// Label Printing Page

const LabelPrintingPage: React.FC<{ product: Product; onBack: () => void }> = ({ product, onBack }) => {

  const [stickers, setStickers] = useState(30);

  const [columns, setColumns] = useState(3);

  const [showRetailPrice, setShowRetailPrice] = useState(true);

  const [showQR, setShowQR] = useState(true);



  return (

    <div className="flex-1 flex flex-col overflow-hidden">

      <main className="flex-1 overflow-y-auto p-6">

        <button onClick={onBack} className="flex items-center gap-2 text-[#94A3B8] hover:text-white transition-colors mb-6">

          <ArrowLeft className="w-4 h-4" />

          Back to Products

        </button>



        <div className="max-w-6xl">

          <h1 className="text-2xl font-bold text-white mb-2">LABEL PRINTING</h1>

          <p className="text-[#94A3B8] mb-6">Configure sheet layout settings and sticker grids below.</p>



          <div className="grid grid-cols-4 gap-6">

            <div className="col-span-1 bg-[#162033] border border-[#263244] rounded-xl p-6 h-fit">

              <div className="mb-6">

                <p className="text-[#94A3B8] text-sm font-medium">PRODUCT INFO</p>

                <p className="text-white font-semibold mt-2">{product.name}</p>

                <p className="text-[#64748B] text-sm">{product.sku}</p>

              </div>



              <div className="mb-6">

                <p className="text-[#94A3B8] text-sm font-medium">LAYOUT PARAMETERS</p>

                <div className="mt-3 space-y-3">

                  <div>

                    <label className="block text-[#94A3B8] text-xs mb-1">STICKERS TO PRINT</label>

                    <input

                      type="number"

                      value={stickers}

                      onChange={(e) => setStickers(Number(e.target.value))}

                      className="w-full bg-[#091018] border border-[#2A3447] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"

                    />

                  </div>

                  <div>

                    <label className="block text-[#94A3B8] text-xs mb-1">COLUMNS IN GRID</label>

                    <select

                      value={columns}

                      onChange={(e) => setColumns(Number(e.target.value))}

                      className="w-full bg-[#091018] border border-[#2A3447] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"

                    >

                      <option value={2}>2 Columns</option>

                      <option value={3}>3 Columns (Standard size)</option>

                      <option value={4}>4 Columns</option>

                    </select>

                  </div>

                </div>

              </div>



              <div>

                <p className="text-[#94A3B8] text-sm font-medium">DISPLAY OPTIONS</p>

                <div className="mt-3 space-y-2">

                  <label className="flex items-center gap-2 cursor-pointer">

                    <input

                      type="checkbox"

                      checked={showRetailPrice}

                      onChange={(e) => setShowRetailPrice(e.target.checked)}

                      className="w-4 h-4 rounded accent-blue-500"

                    />

                    <span className="text-[#94A3B8] text-sm">Display Retail Price</span>

                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">

                    <input

                      type="checkbox"

                      checked={showQR}

                      onChange={(e) => setShowQR(e.target.checked)}

                      className="w-4 h-4 rounded accent-blue-500"

                    />

                    <span className="text-[#94A3B8] text-sm">Include QR Lookup Code</span>

                  </label>

                </div>

              </div>

            </div>



            <div className="col-span-3 bg-[#162033] border border-[#263244] rounded-xl p-6">

              <div className="flex items-center justify-between mb-4">

                <p className="text-[#94A3B8] text-sm">Label Preview ({stickers} stickers)</p>

                <button className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2">

                  <Printer className="w-4 h-4" />

                  Print Labels

                </button>

              </div>



              <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>

                {Array.from({ length: Math.min(stickers, 30) }).map((_, idx) => (

                  <div key={idx} className="bg-[#091018] border border-[#2A3447] rounded-lg p-3 text-center">

                    <p className="text-white font-medium text-xs">{product.name}</p>

                    <p className="text-[#64748B] text-[10px]">{product.sku}</p>

                    {showRetailPrice && (

                      <p className="text-green-400 text-xs font-semibold mt-1">₱{product.unitPrice.toFixed(2)}</p>

                    )}

                    {showQR && (

                      <div className="mt-1 flex justify-center">

                        <QrCode className="w-8 h-8 text-[#64748B]" />

                      </div>

                    )}

                  </div>

                ))}

              </div>

            </div>

          </div>

        </div>

      </main>

    </div>

  );

};



// Main Product Catalog Component

const ProductCatalog: React.FC = () => {

  const [showCreateProduct, setShowCreateProduct] = useState(false);

  const [showLabelPrinting, setShowLabelPrinting] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [searchTerm, setSearchTerm] = useState('');

  const [selectedCategory, setSelectedCategory] = useState('All Categories');

  const [selectedBrand, setSelectedBrand] = useState('All Brands');



  const productKPIs = [

    { label: 'Total Catalog Items', value: '4', subtitle: 'Master Inventory' },

    { label: 'Low Stock Thresholds', value: '1', subtitle: 'Needs Replenishment' },

    { label: 'Out of Stock', value: '0', subtitle: 'Critical Level' },

    { label: 'Avg Catalog Value', value: '₱17,750', subtitle: 'Weighted Unit Average' }

  ];



  // Get unique categories

  const categories = ['All Categories', ...new Set(productData.map(p => p.category))];

  const brands = ['All Brands', ...new Set(productData.map(p => p.brand))];



  // Filter products

  const filteredProducts = productData.filter(product => {

    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||

                          product.sku.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === 'All Categories' || product.category === selectedCategory;

    const matchesBrand = selectedBrand === 'All Brands' || product.brand === selectedBrand;

    return matchesSearch && matchesCategory && matchesBrand;

  });



  // Group products by category

  const groupedProducts = filteredProducts.reduce((acc, product) => {

    if (!acc[product.category]) {

      acc[product.category] = [];

    }

    acc[product.category].push(product);

    return acc;

  }, {} as Record<string, Product[]>);



  if (showCreateProduct) {

    return <CreateProductPage onBack={() => setShowCreateProduct(false)} />;

  }



  if (showLabelPrinting && selectedProduct) {

    return <LabelPrintingPage product={selectedProduct} onBack={() => setShowLabelPrinting(false)} />;

  }



  return (

    <div className="flex-1 flex flex-col overflow-hidden">

      <main className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Header */}

        <div className="flex items-center justify-between gap-4 flex-wrap">

          <div>

            <div className="flex items-center gap-2 text-[#94A3B8] text-sm">

              <span>SmartChain</span>

              <ChevronRight className="w-4 h-4" />

              <span className="text-white">Product Catalog</span>

            </div>

            <h1 className="text-2xl font-bold text-white mt-2">Product Catalog</h1>

            <p className="text-[#94A3B8] text-sm mt-0.5">Manage your master list of products, stock thresholds, pricing, and classifications.</p>

          </div>

          <button

            onClick={() => setShowCreateProduct(true)}

            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-90 whitespace-nowrap shrink-0"

            style={{ backgroundColor: '#5B8CFF', color: '#F5F7FA' }}

          >

            <Plus className="w-4 h-4" />

            Add Product

          </button>

        </div>



        {/* KPI Cards */}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {productKPIs.map((kpi, idx) => (

            <div key={idx} className="bg-[#162033] border border-[#263244] rounded-xl p-4">

              <p className="text-[#94A3B8] text-xs font-medium">{kpi.label}</p>

              <p className="text-2xl font-bold text-white mt-1">{kpi.value}</p>

              <p className="text-[#64748B] text-xs mt-1">{kpi.subtitle}</p>

            </div>

          ))}

        </div>



        {/* Search and Filters */}

        <div className="flex flex-wrap items-center gap-4">

          <div className="flex-1 min-w-[200px]; relative">

            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />

            <input

              type="text"

              placeholder="Search by SKU, product name, or description..."

              value={searchTerm}

              onChange={(e) => setSearchTerm(e.target.value)}

              className="w-full bg-[#162033] border border-[#263244] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-blue-500 transition-colors"

            />

          </div>



          <select

            value={selectedCategory}

            onChange={(e) => setSelectedCategory(e.target.value)}

            className="px-4 py-2.5 bg-[#162033] border border-[#263244] rounded-lg text-[#94A3B8] text-sm hover:bg-[#1E293B] transition-colors focus:outline-none focus:border-blue-500"

          >

            {categories.map(cat => (

              <option key={cat} value={cat}>{cat}</option>

            ))}

          </select>



          <select

            value={selectedBrand}

            onChange={(e) => setSelectedBrand(e.target.value)}

            className="px-4 py-2.5 bg-[#162033] border border-[#263244] rounded-lg text-[#94A3B8] text-sm hover:bg-[#1E293B] transition-colors focus:outline-none focus:border-blue-500"

          >

            {brands.map(brand => (

              <option key={brand} value={brand}>{brand}</option>

            ))}

          </select>



          <button className="px-4 py-2.5 bg-[#162033] border border-[#263244] rounded-lg text-[#94A3B8] text-sm hover:bg-[#1E293B] transition-colors flex items-center gap-1">

            Created (Newest)

            <ChevronDown className="w-4 h-4" />

          </button>

        </div>



        {/* Category Groups */}

        {Object.entries(groupedProducts).map(([category, products]) => (

          <div key={category} className="space-y-3">

            <div className="flex items-center gap-3">

              <h2 className="text-lg font-semibold text-white uppercase tracking-wide">{category}</h2>

              <span className="text-sm text-[#94A3B8]">{products.length} product{products.length > 1 ? 's' : ''}</span>

            </div>



            <div className="bg-[#162033] border border-[#263244] rounded-xl overflow-hidden">

              <div className="overflow-x-auto">

                <table className="w-full">

                  <thead className="border-b border-[#263244] bg-[#0B1220]/50">

                    <tr className="text-left text-[#64748B] text-xs uppercase tracking-wider">

                      <th className="px-4 py-3 font-medium">SKU / CODE</th>

                      <th className="px-4 py-3 font-medium">PRODUCT DETAILS</th>

                      <th className="px-4 py-3 font-medium">TRACKING</th>

                      <th className="px-4 py-3 font-medium">BRAND</th>

                      <th className="px-4 py-3 font-medium text-right">COST PRICE</th>

                      <th className="px-4 py-3 font-medium text-right">UNIT PRICE</th>

                      <th className="px-4 py-3 font-medium">UNIT</th>

                      <th className="px-4 py-3 font-medium text-right">REORDER LIMIT</th>

                      <th className="px-4 py-3 font-medium text-center">ACTIONS</th>

                    </tr>

                  </thead>

                  <tbody>

                    {products.map((product) => (

                      <tr key={product.sku} className="border-b border-[#1E293B] hover:bg-[#1E293B]/40 transition-colors group">

                        <td className="px-4 py-3">

                          <span className="text-white text-sm font-mono">{product.sku}</span>

                        </td>

                        <td className="px-4 py-3">

                          <div>

                            <p className="text-white text-sm">{product.name}</p>

                          </div>

                        </td>

                        <td className="px-4 py-3">

                          <span className="px-2 py-0.5 rounded text-xs font-medium border border-blue-400/20 text-blue-400 bg-blue-400/10">

                            {product.tracking}

                          </span>

                        </td>

                        <td className="px-4 py-3 text-[#94A3B8] text-sm">{product.brand}</td>

                        <td className="px-4 py-3 text-right">

                          <span className="text-white text-sm">₱{product.costPrice.toFixed(2)}</span>

                        </td>

                        <td className="px-4 py-3 text-right">

                          <span className="text-white text-sm">₱{product.unitPrice.toFixed(2)}</span>

                        </td>

                        <td className="px-4 py-3 text-[#94A3B8] text-sm">{product.unit}</td>

                        <td className="px-4 py-3 text-right">

                          <span className="text-white text-sm">{product.reorderLimit}</span>

                        </td>

                        <td className="px-4 py-3">

                          <div className="flex items-center justify-center gap-1">

                            <button

                              onClick={() => {

                                setSelectedProduct(product);

                                setShowLabelPrinting(true);

                              }}

                              className="p-1.5 rounded hover:bg-[#1E293B] text-[#64748B] hover:text-white transition-colors"

                              title="Print Labels"

                            >

                              <Printer className="w-4 h-4" />

                            </button>

                            <button className="p-1.5 rounded hover:bg-[#1E293B] text-[#64748B] hover:text-white transition-colors" title="Edit Product">

                              <Edit className="w-4 h-4" />

                            </button>

                            <button className="p-1.5 rounded hover:bg-[#1E293B] text-[#64748B] hover:text-red-400 transition-colors" title="Delete Product">

                              <Trash2 className="w-4 h-4" />

                            </button>

                            <button className="p-1.5 rounded hover:bg-[#1E293B] text-[#64748B] hover:text-white transition-colors" title="More Actions">

                              <MoreHorizontal className="w-4 h-4" />

                            </button>

                          </div>

                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            </div>

          </div>

        ))}



        {/* Empty State */}

        {Object.keys(groupedProducts).length === 0 && (

          <div className="text-center py-12">

            <Package className="w-12 h-12 text-[#64748B] mx-auto mb-4" />

            <p className="text-[#94A3B8]">No products found matching your criteria</p>

          </div>

        )}

      </main>

    </div>

  );

};



export default ProductCatalog; 

