/** Pricing plans — prices include VAT. Payment out of scope; CTA opens contact. */

export const REGISTERED_TRIAL_FILES = 5;
export const GUEST_FREE_FILES = 2;

export type BillingPeriod = "monthly" | "yearly";

export type PlanId = "free" | "personal" | "business" | "unlimited";

export type Plan = {
  id: PlanId;
  name: string;
  blurb: string;
  monthlyVnd: number;
  yearlyVnd: number;
  monthlyFileQuota: number | null; // null = unlimited or N/A for free guest
  maxUsers: number | null;
  featured?: boolean;
  badge?: string;
  features: string[];
  cta: string;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Miễn phí",
    blurb: "Ký thử nhanh, không cần thẻ",
    monthlyVnd: 0,
    yearlyVnd: 0,
    monthlyFileQuota: null,
    maxUsers: 1,
    cta: "Ký thử miễn phí",
    features: [
      "Ký thử 2 file, không cần đăng ký",
      "Xác minh file không giới hạn",
      "Token của mọi nhà cung cấp",
    ],
  },
  {
    id: "personal",
    name: "Cá nhân",
    blurb: "Ký thường xuyên cho 1 người",
    monthlyVnd: 49_000,
    yearlyVnd: 490_000,
    monthlyFileQuota: 50,
    maxUsers: 1,
    cta: "Chọn gói",
    features: [
      "50 file mỗi tháng",
      "1 người dùng",
      "Dấu thời gian",
      "Lịch sử ký",
    ],
  },
  {
    id: "business",
    name: "Doanh nghiệp",
    blurb: "Nhóm nhỏ, ký nhiều",
    monthlyVnd: 199_000,
    yearlyVnd: 1_990_000,
    monthlyFileQuota: 500,
    maxUsers: 5,
    featured: true,
    badge: "Phổ biến nhất",
    cta: "Chọn gói",
    features: [
      "500 file mỗi tháng",
      "5 người dùng",
      "Kiểm tra dài hạn (LTV)",
      "Hỗ trợ Zalo / điện thoại",
    ],
  },
  {
    id: "unlimited",
    name: "Không giới hạn",
    blurb: "Không giới hạn file và người dùng",
    monthlyVnd: 499_000,
    yearlyVnd: 4_990_000,
    monthlyFileQuota: null,
    maxUsers: null,
    cta: "Chọn gói",
    features: [
      "Không giới hạn file",
      "Không giới hạn người dùng",
      "Phân quyền",
      "Hỗ trợ cài đặt tận nơi",
    ],
  },
];

export const PRICING_LEAD = "Giá đã gồm VAT. Có hóa đơn điện tử.";
export const YEARLY_BONUS = "Trả theo năm, tặng 2 tháng";

export function formatVnd(n: number): string {
  if (n === 0) return "0đ";
  return `${n.toLocaleString("vi-VN")}đ`;
}

export function priceFor(plan: Plan, period: BillingPeriod): string {
  if (plan.id === "free") return "0đ";
  return formatVnd(period === "yearly" ? plan.yearlyVnd : plan.monthlyVnd);
}

export function periodSuffix(period: BillingPeriod): string {
  return period === "yearly" ? "/ năm" : "/ tháng";
}
