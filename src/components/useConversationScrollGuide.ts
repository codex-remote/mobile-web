import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEventHandler, PointerEventHandler, UIEventHandler, WheelEventHandler } from "react";
import type { ChatMessage, SessionDetailStatus } from "../types";
import {
  conversationGuidePlan,
  conversationGuideScroll,
  conversationQuestionScrollTop,
  isConversationNearBottom,
  lastUserMessageId,
  shouldFollowConversationTail,
} from "./conversationScroll";

const QUESTION_TOP_OFFSET = 12;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

type ConversationScrollGuideInput = {
  sessionId: string;
  messages: ChatMessage[];
  detailStatus: SessionDetailStatus;
};

export function useConversationScrollGuide({ sessionId, messages, detailStatus }: ConversationScrollGuideInput) {
  const hasMessages = messages.length > 0;
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const hasMessagesRef = useRef(hasMessages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tailFrameRef = useRef<number | null>(null);
  const guideFrameRef = useRef<number | null>(null);
  const guideDelayRef = useRef<number | null>(null);
  const previousScrollTopRef = useRef(0);
  const previousSessionIdRef = useRef("");
  const guidedSessionIdRef = useRef("");
  const canceledGuideSessionIdRef = useRef("");
  const guideActiveRef = useRef(false);
  const settlingSessionRef = useRef(false);
  const followingTailRef = useRef(true);
  const userScrollIntentRef = useRef(false);
  const anchorElementRef = useRef<HTMLElement | null>(null);
  hasMessagesRef.current = hasMessages;

  const clearGuideMotion = () => {
    if (guideDelayRef.current !== null) {
      window.clearTimeout(guideDelayRef.current);
      guideDelayRef.current = null;
    }
    if (guideFrameRef.current !== null) {
      window.cancelAnimationFrame(guideFrameRef.current);
      guideFrameRef.current = null;
    }
    anchorElementRef.current?.classList.remove("message-user-guide-anchor");
    anchorElementRef.current = null;
    guideActiveRef.current = false;
  };

  const focusQuestion = (question: HTMLElement) => {
    anchorElementRef.current?.classList.remove("message-user-guide-anchor");
    anchorElementRef.current = question;
    question.classList.add("message-user-guide-anchor");
  };

  const scheduleScrollToTail = () => {
    if (guideActiveRef.current || settlingSessionRef.current || !followingTailRef.current || tailFrameRef.current !== null) return;
    tailFrameRef.current = window.requestAnimationFrame(() => {
      tailFrameRef.current = null;
      const scroller = scrollRef.current;
      if (!scroller || guideActiveRef.current || settlingSessionRef.current || !followingTailRef.current) return;
      scroller.scrollTop = scroller.scrollHeight;
      previousScrollTopRef.current = scroller.scrollTop;
    });
  };

  const cancelGuideForUser = () => {
    const scroller = scrollRef.current;
    canceledGuideSessionIdRef.current = sessionId;
    clearGuideMotion();
    settlingSessionRef.current = false;
    userScrollIntentRef.current = true;
    const followingTail = Boolean(scroller && hasMessagesRef.current && isConversationNearBottom(scroller));
    followingTailRef.current = followingTail;
    setShowJumpToLatest(Boolean(scroller && hasMessagesRef.current && !followingTail));
  };

  const jumpToLatest = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    canceledGuideSessionIdRef.current = sessionId;
    clearGuideMotion();
    settlingSessionRef.current = false;
    followingTailRef.current = true;
    userScrollIntentRef.current = false;
    setShowJumpToLatest(false);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
    previousScrollTopRef.current = scroller.scrollTop;
  };

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const sessionChanged = previousSessionIdRef.current !== sessionId;
    if (sessionChanged) {
      clearGuideMotion();
      if (tailFrameRef.current !== null) {
        window.cancelAnimationFrame(tailFrameRef.current);
        tailFrameRef.current = null;
      }
      previousSessionIdRef.current = sessionId;
      guidedSessionIdRef.current = "";
      canceledGuideSessionIdRef.current = "";
      followingTailRef.current = true;
      settlingSessionRef.current = true;
      userScrollIntentRef.current = false;
      setShowJumpToLatest(false);
      scroller.scrollTop = 0;
      previousScrollTopRef.current = 0;
    }

    const detailVisible = detailStatus === "ready" || detailStatus === "refreshing" || detailStatus === "stale-error";
    if (!detailVisible || !hasMessages) return;
    if (guidedSessionIdRef.current === sessionId) {
      scheduleScrollToTail();
      return;
    }

    guidedSessionIdRef.current = sessionId;
    if (canceledGuideSessionIdRef.current === sessionId) {
      settlingSessionRef.current = false;
      followingTailRef.current = false;
      return;
    }

    const questionId = lastUserMessageId(messages);
    const question = [...scroller.querySelectorAll<HTMLElement>("[data-message-role='user']")]
      .find((element) => element.dataset.messageId === questionId);
    if (!question) {
      settlingSessionRef.current = false;
      setShowJumpToLatest(false);
      scheduleScrollToTail();
      return;
    }

    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const questionTop = conversationQuestionScrollTop(
      scroller.scrollTop,
      scroller.getBoundingClientRect().top,
      question.getBoundingClientRect().top,
      maxScrollTop,
      QUESTION_TOP_OFFSET,
    );
    scroller.scrollTop = questionTop;
    previousScrollTopRef.current = questionTop;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      scroller.scrollTop = scroller.scrollHeight;
      previousScrollTopRef.current = scroller.scrollTop;
      settlingSessionRef.current = false;
      setShowJumpToLatest(false);
      return;
    }

    const initialDistance = maxScrollTop - questionTop;
    const guidePlan = conversationGuidePlan(initialDistance, scroller.clientHeight);
    if (guidePlan.profile === "none") {
      settlingSessionRef.current = false;
      setShowJumpToLatest(false);
      return;
    }
    focusQuestion(question);
    if (guidePlan.profile === "long") {
      settlingSessionRef.current = false;
      followingTailRef.current = false;
      setShowJumpToLatest(true);
      return;
    }

    const animationProfile: "short" | "medium" = guidePlan.profile;
    guideActiveRef.current = true;
    setShowJumpToLatest(false);
    guideDelayRef.current = window.setTimeout(() => {
      guideDelayRef.current = null;
      let animationStartedAt: number | null = null;
      const animate = (timestamp: number) => {
        if (!guideActiveRef.current || canceledGuideSessionIdRef.current === sessionId) return;
        animationStartedAt ??= timestamp;
        const progress = Math.min(1, (timestamp - animationStartedAt) / guidePlan.duration);
        const currentEnd = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        scroller.scrollTop = conversationGuideScroll(questionTop, currentEnd, progress, animationProfile);
        previousScrollTopRef.current = scroller.scrollTop;
        if (progress < 1) {
          guideFrameRef.current = window.requestAnimationFrame(animate);
          return;
        }
        guideFrameRef.current = null;
        guideActiveRef.current = false;
        settlingSessionRef.current = false;
        followingTailRef.current = true;
        anchorElementRef.current?.classList.remove("message-user-guide-anchor");
        anchorElementRef.current = null;
        setShowJumpToLatest(false);
        scroller.scrollTop = scroller.scrollHeight;
        previousScrollTopRef.current = scroller.scrollTop;
      };
      guideFrameRef.current = window.requestAnimationFrame(animate);
    }, guidePlan.pause);
  }, [detailStatus, hasMessages, messages, sessionId]);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const content = scroller?.firstElementChild;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleScrollToTail);
    if (scroller) observer?.observe(scroller);
    if (content) observer?.observe(content);
    window.addEventListener("resize", scheduleScrollToTail);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", scheduleScrollToTail);
      if (tailFrameRef.current !== null) {
        window.cancelAnimationFrame(tailFrameRef.current);
        tailFrameRef.current = null;
      }
      clearGuideMotion();
      // Strict Mode replays layout effects without recreating refs.
      // Let the replay initialize the guide again instead of leaving it settled halfway.
      guidedSessionIdRef.current = "";
      settlingSessionRef.current = false;
    };
  }, []);

  const onPointerDown: PointerEventHandler<HTMLDivElement> = cancelGuideForUser;
  const onWheel: WheelEventHandler<HTMLDivElement> = cancelGuideForUser;
  const onKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (SCROLL_KEYS.has(event.key)) cancelGuideForUser();
  };
  const onScroll: UIEventHandler<HTMLDivElement> = (event) => {
    const scroller = event.currentTarget;
    if (settlingSessionRef.current || guideActiveRef.current) {
      previousScrollTopRef.current = scroller.scrollTop;
      return;
    }
    const followingTail = shouldFollowConversationTail(
      scroller,
      previousScrollTopRef.current,
      followingTailRef.current,
      userScrollIntentRef.current,
    );
    followingTailRef.current = followingTail;
    setShowJumpToLatest(!followingTail);
    if (!followingTail) userScrollIntentRef.current = false;
    previousScrollTopRef.current = scroller.scrollTop;
  };

  return { scrollRef, showJumpToLatest, jumpToLatest, onPointerDown, onWheel, onKeyDown, onScroll };
}
