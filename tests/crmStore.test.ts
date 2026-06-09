import { describe, expect, it } from "vitest";
import { createMemoryCrmStore } from "../server/services/crmStore";
import type { ConsultationAnalysis } from "../server/types";

const analysis: ConsultationAnalysis = {
  customerIntent: "방문예약 문의",
  interestLevel: "높음",
  mainConcerns: ["초기 자금"],
  recommendedScriptType: "방문예약 확정 유도",
  recommendedScript: "방문 가능 시간을 확정해 주세요.",
  nextAction: "방문예약 생성",
  riskAlert: "가격 조건을 단정하지 말 것",
  managerSummary: "주말 방문 가능성이 높음.",
  sentiment: "긍정",
  leadQuality: "qualified"
};

describe("CRM store", () => {
  it("normalizes phone numbers and flags repeat leads as duplicates", async () => {
    const store = createMemoryCrmStore();

    const first = await store.createConsultation({
      customerName: "김고객",
      phone: "010-1234-5678",
      siteName: "속초 중앙하이츠 THE 228",
      sourceChannel: "naver",
      transcript: "방문예약 문의",
      analysis
    });
    const second = await store.createConsultation({
      customerName: "김고객",
      phone: "010 1234 5678",
      siteName: "속초 중앙하이츠 THE 228",
      sourceChannel: "naver",
      transcript: "재문의",
      analysis
    });

    expect(first.customer.normalizedPhone).toBe("01012345678");
    expect(first.adLead.isDuplicate).toBe(false);
    expect(second.adLead.isDuplicate).toBe(true);
  });

  it("summarizes dashboard metrics for CRM operations", async () => {
    const store = createMemoryCrmStore();

    await store.createConsultation({
      customerName: "김고객",
      phone: "010-1111-2222",
      siteName: "A 현장",
      sourceChannel: "naver",
      transcript: "방문예약 문의",
      analysis
    });
    await store.createConsultation({
      customerName: "이고객",
      phone: "010-3333-4444",
      siteName: "A 현장",
      sourceChannel: "google",
      transcript: "위치 문의",
      analysis: { ...analysis, customerIntent: "위치 문의", interestLevel: "중간" }
    });
    await store.createReservation({
      customerId: "customer-1",
      siteId: "site-1",
      scheduledAt: "2026-06-10T02:00:00.000Z",
      memo: "오전 방문"
    });
    await store.createMessageLog({
      customerId: "customer-1",
      siteId: "site-1",
      messageTemplateType: "visit_confirmation",
      messageBody: "예약이 확정되었습니다.",
      triggerEvent: "reservation_created"
    });

    const dashboard = await store.getDashboard();

    expect(dashboard.totalConsultations).toBe(2);
    expect(dashboard.interestedCustomers).toBe(1);
    expect(dashboard.visitReservations).toBe(1);
    expect(dashboard.sentMessages).toBe(1);
    expect(dashboard.siteConversionRates[0]).toEqual(
      expect.objectContaining({
        siteName: "A 현장",
        consultations: 2,
        reservations: 1
      })
    );
  });
});
