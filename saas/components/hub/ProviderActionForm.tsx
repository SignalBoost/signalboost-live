StripeProductsManager Component (components/StripeProductsManager.tsx)
tsx
import { useState } from "react";
import { useTranslation } from "next-i18next";

interface Price {
  id: string;
  unit_amount: number;
  currency: string;
}

interface Product {
  id: string;
  name: string;
  active: boolean;
  created: number;
  prices?: Price[];
}

export default function StripeProductsManager({ products }: { products: Product[] }) {
  const { t } = useTranslation();
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [action, setAction] = useState<"add" | "edit" | "delete" | "archive" | null>(null);

  const activeProducts = products.filter((p) => p.active);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!action) return;
    console.log(`Performing ${action} on product ${selectedProduct}`);
    // TODO: Call Stripe API endpoint based on action
  };

  return (
    <div className="stripe-manager">
      <h2>{t("stripe.manage_products", "Manage Stripe Products")}</h2>

      <div className="actions">
        <button onClick={() => setAction("add")}>{t("actions.create_product")}</button>
        <button onClick={() => setAction("edit")}>{t("actions.edit_product")}</button>
        <button onClick={() => setAction("delete")}>{t("actions.delete_product")}</button>
        <button onClick={() => setAction("archive")}>{t("actions.archive_product")}</button>
      </div>

      {action && (
        <form onSubmit={handleSubmit} className="action-form">
          {action !== "add" && (
            <div className="selector">
              <label>{t("common.select_product")}</label>
              <select
                value={selectedProduct || ""}
                onChange={(e) => setSelectedProduct(e.target.value)}
              >
                <option value="">{t("common.choose")}</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          {action === "add" && (
            <div className="input">
              <label>{t("common.name")}</label>
              <input type="text" placeholder={t("common.enter_name")} />
              <label>{t("common.price")}</label>
              <input type="number" placeholder="0.00" />
              <label>{t("common.currency")}</label>
              <input type="text" placeholder="USD" />
            </div>
          )}

          <button type="submit">{t("common.run")}</button>
        </form>
      )}

      <style jsx>{`
        .stripe-manager {
          background: #1e1e1e;
          padding: 2rem;
          border-radius: 8px;
          margin-top: 2rem;
        }
        .actions {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .action-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          background: #2a2a2a;
          padding: 1rem;
          border-radius: 4px;
        }
        .selector, .input {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        select, input {
          padding: 0.5rem;
          border-radius: 4px;
          border: none;
        }
        button {
          background: #0070f3;
          color: #fff;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover {
          background: #005bb5;
        }
      `}</style>
    </div>
  );
}
🌐 Translation Keys
Add to locales/en.json (mirror into ES, PT, PL, RU):

json
{
  "stripe": {
    "manage_products": "Manage Stripe Products"
  },
  "common": {
    "select_product": "Select Product",
    "choose": "Choose...",
    "enter_name": "Enter name",
    "price": "Price",
    "currency": "Currency",
    "run": "Run"
  }
}
🎯 Benefits
Supports add, edit, delete, archive actions.

Shows active products list in a dropdown for edit/delete/archive.

Clean form layout with i18n labels.

Ready to wire into Stripe API calls.
