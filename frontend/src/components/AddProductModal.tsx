// src/components/AddProductModal.tsx
import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ProductFormData {
  sku: string;
  name: string;
  category: string;
  brand: string;
  tracking: 'SERIAL' | 'BATCH' | 'NONE';
  costPrice: number;
  unitPrice: number;
  unit: string;
  reorderLimit: number;
}

const AddProductModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ProductFormData) => void;
}> = ({ isOpen, onClose, onSave }) => {
  if (!isOpen) return null;

  const [formData, setFormData] = useState<ProductFormData>({
    sku: '',
    name: '',
    category: '',
    brand: '',
    tracking: 'SERIAL',
    costPrice: 0,
    unitPrice: 0,
    unit: 'pcs',
    reorderLimit: 0
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" 
      onClick={onClose}
    >
      <div 
        className="bg-[#111827] border border-slate-800 rounded-2xl p-6 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white tracking-tight">Create New Product</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-hover:bg-slate-700 text-slate-400 hover:text-white transition-colors duration-150">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Product Media Upload */}
          <div className="flex items-center gap-4 pb-6 border-b border-slate-800">
            <div className="w-16 h-16 rounded-full bg-slate-800/20 border-2 border-slate-800/30 flex items-center justify-center text-2xl font-bold text-slate-800 shrink-0">
              +
            </div>
            <div>
              <p className="text-white text-sm font-medium">Product Image</p>
              <p className="text-slate-400 text-xs mt-0.5">Click to upload or drag & drop product image</p>
              <button type="button" className="mt-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors duration-150">
                Upload Photo
              </button>
            </div>
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Row 1: Category | Brand */}
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-400">Category *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Category</option>
                <option value="Electronics">Electronics</option>
                <option value="Beverages">Beverages</option>
                <option value="Kitchenware">Kitchenware</option>
                <option value="Apparel">Apparel</option>
                <option value="Office Supplies">Office Supplies</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-400">Brand *</label>
              <select
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Brand</option>
                <option value="Apple">Apple</option>
                <option value="Samsung">Samsung</option>
                <option value="Sony">Sony</option>
                <option value="Nike">Nike</option>
                <option value="Adidas">Adidas</option>
                <option value="Generic">Generic</option>
              </select>
            </div>

            {/* Row 2: Product Name / SKU | Measurement Unit */}
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-400">Product Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-400">Measurement Unit *</label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="pcs">Pieces</option>
                <option value="box">Box</option>
                <option value="kg">Kilograms</option>
                <option value="liter">Liters</option>
                <option value="meter">Meters</option>
              </select>
            </div>

            {/* Row 3: Cost Price (₱) | Unit Price (₱) */}
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-400">Cost Price (₱) *</label>
              <input
                type="number"
                value={formData.costPrice}
                onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                step="0.01"
                min="0"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-400">Unit Price (₱) *</label>
              <input
                type="number"
                value={formData.unitPrice}
                onChange={(e) => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                step="0.01"
                min="0"
                required
              />
            </div>

            {/* Row 4: Reorder Limit Qty | Inventory Control */}
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-400">Reorder Limit Qty *</label>
              <input
                type="number"
                value={formData.reorderLimit}
                onChange={(e) => setFormData({ ...formData, reorderLimit: parseInt(e.target.value) || 0 })}
                className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-400">Inventory Tracking Control *</label>
              <select
                value={formData.tracking}
                onChange={(e) => setFormData({ ...formData, tracking: e.target.value as 'SERIAL' | 'BATCH' | 'NONE' })}
                className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="SERIAL">Unique Serial Number</option>
                <option value="BATCH">Batch Control</option>
                <option value="NONE">None</option>
              </select>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 border border-slate-800 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 px-4 rounded-lg text-sm font-medium transition-opacity duration-200 hover:opacity-90"
              style={{ backgroundColor: '#5B8CFF', color: '#FFFFFF' }}
            >
              Save Product
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProductModal;