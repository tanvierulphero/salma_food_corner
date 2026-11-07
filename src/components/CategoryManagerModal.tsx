import React, { useState } from 'react';
import { X, Plus, Edit3, Trash2, CheckCircle2, AlertTriangle, Layers, Sparkles } from 'lucide-react';
import { MenuCategory, FoodItem } from '../types';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: MenuCategory[];
  menuItems: FoodItem[];
  onSaveCategories: (updatedCategories: MenuCategory[], updatedMenuItems?: FoodItem[]) => void;
}

const POPULAR_EMOJIS = ['🔥', '🎁', '🍛', '🍔', '🥘', '🍮', '🍕', '🍜', '🥗', '☕', '🥤', '🍗', '🥪', '🥟', '🍱', '🍦'];

export default function CategoryManagerModal({
  isOpen,
  onClose,
  categories,
  menuItems,
  onSaveCategories
}: CategoryManagerModalProps) {
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [nameBn, setNameBn] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [icon, setIcon] = useState('🍽️');
  const [categoryId, setCategoryId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleStartEdit = (cat: MenuCategory) => {
    setEditingCategory(cat);
    setNameBn(cat.nameBn);
    setNameEn(cat.nameEn);
    setIcon(cat.icon || '🍽️');
    setCategoryId(cat.id);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleCancelEdit = () => {
    setEditingCategory(null);
    setNameBn('');
    setNameEn('');
    setIcon('🍽️');
    setCategoryId('');
    setErrorMsg('');
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!nameBn.trim()) {
      setErrorMsg('ক্যাটাগরির বাংলা নাম লিখুন।');
      return;
    }

    if (editingCategory) {
      // Editing existing category
      const oldId = editingCategory.id;
      const targetId = categoryId.trim() || oldId;

      // Check if targetId already exists in another category
      if (targetId !== oldId && categories.some(c => c.id.toLowerCase() === targetId.toLowerCase())) {
        setErrorMsg('এই ক্যাটাগরি আইডিটি ইতিমধ্যে অন্য ক্যাটাগরিতে ব্যবহৃত হয়েছে।');
        return;
      }

      const updatedCategories = categories.map(c => {
        if (c.id === oldId) {
          return {
            ...c,
            id: targetId,
            nameBn: nameBn.trim(),
            nameEn: nameEn.trim() || nameBn.trim(),
            icon: icon.trim() || '🍽️'
          };
        }
        return c;
      });

      let updatedMenu: FoodItem[] | undefined;
      if (oldId !== targetId) {
        // Migrate all food items with oldId to targetId
        updatedMenu = menuItems.map(item => {
          if (item.category === oldId) {
            return { ...item, category: targetId };
          }
          return item;
        });
      }

      onSaveCategories(updatedCategories, updatedMenu);
      setSuccessMsg(`'${nameBn.trim()}' ক্যাটাগরি সফলভাবে আপডেট করা হয়েছে!`);
      handleCancelEdit();
    } else {
      // Adding new category
      const slugId = nameEn.trim()
        ? nameEn.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 25)
        : 'cat_' + Date.now().toString(36);
      const targetId = categoryId.trim() || slugId;

      if (categories.some(c => c.id.toLowerCase() === targetId.toLowerCase())) {
        setErrorMsg('এই ক্যাটাগরি আইডি ইতিমধ্যে রয়েছে। অনুগ্রহ করে ভিন্ন নাম বা আইডি দিন।');
        return;
      }

      const newCategory: MenuCategory = {
        id: targetId,
        nameBn: nameBn.trim(),
        nameEn: nameEn.trim() || nameBn.trim(),
        icon: icon.trim() || '🍽️'
      };

      const updatedCategories = [...categories, newCategory];
      onSaveCategories(updatedCategories);
      setSuccessMsg(`নতুন ক্যাটাগরি '${nameBn.trim()}' যোগ করা হয়েছে!`);
      handleCancelEdit();
    }
  };

  const handleDelete = (cat: MenuCategory) => {
    if (categories.length <= 1) {
      alert('কমপক্ষে একটি ক্যাটাগরি থাকা আবশ্যক। এই ক্যাটাগরিটি ডিলেট করা যাবে না।');
      return;
    }

    const itemsInCat = menuItems.filter(item => item.category === cat.id);
    const fallback = categories.find(c => c.id !== cat.id) || { id: 'popular', nameBn: 'জনপ্রিয়' };

    let confirmMsg = `আপনি কি নিশ্চিত যে '${cat.nameBn}' ক্যাটাগরিটি মুছে ফেলতে চান?`;
    if (itemsInCat.length > 0) {
      confirmMsg = `সতর্কতা: এই ক্যাটাগরিতে ${itemsInCat.length}টি খাবার রয়েছে!\n\nক্যাটাগরি মুছে ফেললে এই খাবারগুলো '${fallback.nameBn}' ক্যাটাগরিতে স্থানান্তরিত করা হবে যাতে কোনো খাবার মেনু থেকে মুছে না যায়।\n\nআপনি কি নিশ্চিত যে ক্যাটাগরিটি মুছে ফেলবেন?`;
    }

    if (window.confirm(confirmMsg)) {
      let updatedMenu: FoodItem[] | undefined;
      if (itemsInCat.length > 0) {
        updatedMenu = menuItems.map(item => {
          if (item.category === cat.id) {
            return { ...item, category: fallback.id };
          }
          return item;
        });
      }

      const updatedCategories = categories.filter(c => c.id !== cat.id);
      onSaveCategories(updatedCategories, updatedMenu);

      if (editingCategory?.id === cat.id) {
        handleCancelEdit();
      }
      setSuccessMsg(`'${cat.nameBn}' ক্যাটাগরিটি মুছে ফেলা হয়েছে।`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl border border-amber-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 bg-gradient-to-r from-amber-50/80 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-gray-900 text-sm sm:text-base flex items-center gap-1.5">
                <span>মেনু ক্যাটাগরি ব্যবস্থাপনা</span>
                <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                  মোট {categories.length} টি
                </span>
              </h3>
              <p className="text-[11px] text-gray-500">
                খাবারের ক্যাটাগরি এডিট, ডিলেট ও নতুন ক্যাটাগরি তৈরি করুন
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          
          {/* Notifications */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form: Add or Edit */}
          <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-gray-900 flex items-center gap-1.5 text-xs">
                {editingCategory ? (
                  <>
                    <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                    <span>ক্যাটাগরি এডিট: <strong className="text-blue-700">{editingCategory.nameBn}</strong></span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 text-emerald-600" />
                    <span>নতুন ক্যাটাগরি তৈরি করুন</span>
                  </>
                )}
              </h4>
              {editingCategory && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-[11px] font-bold text-gray-500 hover:text-gray-700 underline cursor-pointer"
                >
                  নতুন তৈরিতে ফেরত যান
                </button>
              )}
            </div>

            <form onSubmit={handleSaveForm} className="space-y-3">
              {/* Emoji Picker */}
              <div>
                <label className="block text-gray-700 font-bold text-[11px] mb-1">
                  আইকন / ইমোজি নির্বাচন করুন:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    maxLength={4}
                    className="w-12 h-9 text-center text-lg border border-gray-300 rounded-xl bg-white focus:outline-none focus:border-amber-500"
                    placeholder="🍽️"
                  />
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none flex-1">
                    {POPULAR_EMOJIS.map(em => (
                      <button
                        type="button"
                        key={em}
                        onClick={() => setIcon(em)}
                        className={`w-7 h-7 text-sm rounded-lg flex items-center justify-center shrink-0 transition cursor-pointer ${
                          icon === em ? 'bg-amber-500 text-white shadow-xs scale-105' : 'bg-white hover:bg-amber-100 border border-gray-200'
                        }`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Name Bn & En */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-gray-700 font-bold text-[11px] mb-1">
                    বাংলা নাম <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={nameBn}
                    onChange={(e) => setNameBn(e.target.value)}
                    placeholder="যেমন: স্ন্যাকস ও নাস্তা"
                    className="w-full p-2 border border-gray-300 rounded-xl bg-white font-bold focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-bold text-[11px] mb-1">
                    ইংরেজি নাম / ID
                  </label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="e.g. Snacks & Bites"
                    className="w-full p-2 border border-gray-300 rounded-xl bg-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-1">
                {editingCategory && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-3 py-2 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-100 transition cursor-pointer"
                  >
                    বাতিল
                  </button>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white font-bold shadow-xs transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                  <span>{editingCategory ? 'ক্যাটাগরি আপডেট করুন' : '+ ক্যাটাগরি সংরক্ষণ'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* List of Existing Categories */}
          <div>
            <h4 className="font-bold text-gray-800 text-xs mb-2">
              বর্তমান ক্যাটাগরি তালিকা ({categories.length} টি)
            </h4>
            <div className="space-y-2">
              {categories.map((cat) => {
                const count = menuItems.filter(item => item.category === cat.id).length;
                const isSelected = editingCategory?.id === cat.id;

                return (
                  <div
                    key={cat.id}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition ${
                      isSelected 
                        ? 'bg-blue-50/60 border-blue-400 shadow-xs' 
                        : 'bg-white border-gray-200 hover:border-amber-300 hover:shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl shrink-0 p-1 bg-amber-50 rounded-xl">
                        {cat.icon || '🍽️'}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h5 className="font-bold text-gray-900 text-xs truncate">
                            {cat.nameBn}
                          </h5>
                          <span className="text-[10px] text-gray-500 font-mono hidden sm:inline truncate">
                            ({cat.nameEn})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] bg-gray-100 text-gray-700 font-bold px-1.5 py-0.2 rounded-md">
                            {count} টি খাবার
                          </span>
                          <span className="text-[9px] text-gray-400 font-mono">
                            ID: {cat.id}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleStartEdit(cat)}
                        className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                        title="এডিট করুন"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>এডিট</span>
                      </button>

                      <button
                        onClick={() => handleDelete(cat)}
                        className="px-2 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                        title="মুছে ফেলুন"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span className="hidden sm:inline">ডিলেট</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gray-800 hover:bg-gray-900 text-white font-bold text-xs transition cursor-pointer"
          >
            সম্পন্ন / বন্ধ করুন
          </button>
        </div>

      </div>
    </div>
  );
}
