import type { ComponentType } from "react"
import {
  Boxes,
  FileChartColumn,
  Gauge,
  Landmark,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Upload,
  Users,
  CreditCard,
  Bot,
  BarChart3,
} from "lucide-react"

export type NavIcon =
  | "layout-dashboard"
  | "receipt"
  | "shopping-cart"
  | "upload"
  | "landmark"
  | "users"
  | "package"
  | "boxes"
  | "file-chart"
  | "calculator"
  | "settings"
  | "credit-card"
  | "bot"
  | "bar-chart"

export const navIconMap: Record<NavIcon, ComponentType<{ className?: string }>> = {
  "layout-dashboard": LayoutDashboard,
  receipt: Receipt,
  "shopping-cart": ShoppingCart,
  upload: Upload,
  landmark: Landmark,
  users: Users,
  package: Package,
  boxes: Boxes,
  "file-chart": FileChartColumn,
  calculator: Gauge,
  settings: Settings,
  "credit-card": CreditCard,
  bot: Bot,
  "bar-chart": BarChart3,
}
