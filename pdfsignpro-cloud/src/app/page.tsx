"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import * as m from "motion/react-m";
import { useInView, useReducedMotion } from "motion/react";
import {
  Upload,
  Monitor,
  FileUp,
  MousePointer,
  Shield,
  Check,
  FileCheck,
  Usb,
  BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadModal } from "@/components/upload";
import { HeroDemoCard } from "@/components/home/hero-demo-card";

const MOTION = { duration: 0.2, ease: [0, 0, 0.2, 1] as const };

const STEPS = [
  {
    icon: FileUp,
    title: "Tải lên PDF",
    copy: "Kéo thả hoặc chọn file. Tối đa 50MB.",
  },
  {
    icon: MousePointer,
    title: "Đặt vị trí chữ ký",
    copy: "Chọn vị trí ô ký trên tài liệu.",
  },
  {
    icon: Shield,
    title: "Ký số USB Token",
    copy: "Cắm Token, mở Signer và ký. PDF lưu tự động.",
  },
] as const;

const FEATURES = [
  "Ký số PDF chuẩn PKCS#7 với USB Token (Viettel, EasyCA, FastCA…)",
  "Signer chạy trên Windows, kết nối trực tiếp trình duyệt",
  "Xem trước chữ ký, thông tin chứng thư, thời gian ký",
  "Chia sẻ liên kết đã ký, tải PDF đã ký",
] as const;

const TRUST_ITEMS = [
  { icon: FileCheck, label: "PAdES" },
  { icon: Usb, label: "USB Token" },
  { icon: BadgeCheck, label: "Adobe Verify" },
] as const;

function StepCard({
  icon: Icon,
  title,
  copy,
  index,
  isInView,
  reduceMotion,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  copy: string;
  index: number;
  isInView: boolean;
  reduceMotion: boolean;
}) {
  const y = reduceMotion ? 0 : 12;
  const opacity = isInView ? 1 : 0.5;

  return (
    <m.div
      className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.07]"
      initial={false}
      animate={{
        opacity,
        y: isInView ? 0 : y,
      }}
      transition={{ ...MOTION, delay: index * 0.06 }}
      whileHover={
        reduceMotion ? undefined : { y: -2, transition: MOTION }
      }
    >
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/10">
        <Icon className="size-6 text-violet-300" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm text-zinc-400">{copy}</p>
    </m.div>
  );
}

export default function HomePage() {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const stepsRef = useRef<HTMLDivElement>(null);
  const stepsInView = useInView(stepsRef, { once: true, margin: "0px 0px -80px 0px" });
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative min-h-screen linear-home-bg">
      {/* Layered background */}
      <div className="linear-glow-1" />
      <div className="linear-glow-2" />
      <div className="linear-glow-3" />
      <div className="linear-grid" />
      <div className="linear-noise" />

      {/* Hero */}
      <section className="relative px-6 pb-24 pt-16 sm:pb-32 sm:pt-24 md:pb-40 md:pt-28">
        <div className="container relative mx-auto max-w-6xl">
          <div className="grid gap-16 lg:grid-cols-[1fr,minmax(280px,360px)] lg:items-center lg:gap-24">
            <div className="space-y-10 text-left">
              <m.div
                className="space-y-5"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...MOTION, delay: 0.05 }}
              >
                <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl md:leading-[1.1]">
                  Ký số PDF — nhanh, chuẩn, an toàn
                </h1>
                <p className="max-w-lg text-lg text-zinc-400 sm:text-xl">
                  Tải PDF lên, đặt vị trí chữ ký, ký số bằng USB Token trên Windows.
                </p>
              </m.div>
              <m.div
                className="flex flex-wrap items-center gap-3"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...MOTION, delay: 0.1 }}
              >
                <Button
                  size="lg"
                  className="rounded-lg bg-white px-6 text-zinc-900 hover:bg-zinc-100"
                  onClick={() => setUploadModalOpen(true)}
                >
                  <Upload className="size-4" />
                  Tải PDF lên
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  asChild
                  className="rounded-lg border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <a href="/api/signer/download">
                    <Monitor className="size-4" />
                    Tải Signer
                  </a>
                </Button>
              </m.div>
              <m.p
                className="text-sm text-zinc-500"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...MOTION, delay: 0.15 }}
              >
                <Link
                  href="/signer"
                  className="underline-offset-4 hover:underline hover:text-zinc-400"
                >
                  Hướng dẫn cài đặt
                </Link>
              </m.p>
            </div>
            <div className="flex justify-center lg:justify-end">
              <HeroDemoCard />
            </div>
          </div>
        </div>
      </section>

      {/* Cách hoạt động */}
      <section className="relative border-t border-white/5 px-6 py-20 sm:py-28">
        <div className="container mx-auto max-w-6xl">
          <m.h2
            className="mb-14 text-left text-2xl font-semibold text-white sm:text-3xl"
            ref={stepsRef}
          >
            Cách hoạt động
          </m.h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <StepCard
                key={step.title}
                {...step}
                index={i}
                isInView={!!stepsInView}
                reduceMotion={!!reduceMotion}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Tính năng */}
      <section className="relative border-t border-white/5 px-6 py-20 sm:py-28">
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-start lg:gap-24">
            <div>
              <h2 className="mb-10 text-2xl font-semibold text-white sm:text-3xl">
                Tính năng
              </h2>
              <ul className="space-y-5">
                {FEATURES.map((text, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-1.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20">
                      <Check className="size-3 text-violet-400" />
                    </span>
                    <span className="text-zinc-400">{text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <m.div
              className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm sm:p-8"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={MOTION}
            >
              <h3 className="mb-6 text-lg font-semibold text-white">Đáng tin cậy</h3>
              <div className="flex flex-wrap gap-3">
                {TRUST_ITEMS.map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5"
                  >
                    <Icon className="size-4 text-violet-400" />
                    <span className="text-sm font-medium text-white">{label}</span>
                  </div>
                ))}
              </div>
            </m.div>
          </div>
        </div>
      </section>

      <UploadModal open={uploadModalOpen} onOpenChange={setUploadModalOpen} />
    </div>
  );
}
