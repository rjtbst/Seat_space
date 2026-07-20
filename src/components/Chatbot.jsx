"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  X,
  Send,
  User,
  Loader2,
  Phone,
  Mail,
  ExternalLink,
  GraduationCap,
  Link2,
} from "lucide-react";

// ── Config imports — single source of truth ───────────────────────────────────
import { servicesConfig } from "@/config/servicesConfig";
import { coursesConfig } from "@/config/coursesConfig";

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "👋 Hi! I'm Arty, your Aartechus assistant. Ask me about our bootcamps, IT services,  career outcomes, or payment options — I'm here to help!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // ── Dynamic system prompt — generated entirely from config ─────────────────
  const systemPrompt = useMemo(() => {
    const coursesList = coursesConfig
      .map(
        (c, i) =>
          `${i + 1}. ${c.title} (${c.subtitle}) — ${c.duration}, ` +
          `   Modes: ${c.modes.join(", ")} | Level: ${c.level}\n` +
          `   Highlights: ${c.highlights.join(", ")}\n` +
          `   Tags: ${c.tags.join(", ")}`,
      )
      .join("\n\n");

    const servicesList = servicesConfig
      .map(
        (s, i) =>
          `${i + 1}. ${s.title} — ${s.description}\n` +
          `   Key deliverables: ${s.deliverables.slice(0, 3).join(", ")}`,
      )
      .join("\n\n");

    return `You are "Arty", a friendly and knowledgeable assistant for Aartechus — a US-based tech education and IT services company.

COMPANY IDENTITY:
- Name: Aartechus
- Tagline: Learn. Build. Grow.
- Based in the United States (fully remote & online-first)
- Phone: +1 307 998 3803
- Email: hello@aartechus.com
- Website: aartechus.com
- WhatsApp: +1 307 998 3803

WHAT WE DO:
Aartechus has three pillars:
1. Tech Education — Job-ready bootcamps with career support focused on the US job market
2. IT Services — Custom software development for US startups and enterprises
3. Staffing & Recruitment — Pre-vetted tech talent for contract & full-time roles (all work authorizations)

━━━━━━━━━━━━━━━━━━━━━━━━━
BOOTCAMPS WE OFFER (${coursesConfig.length} programs):
━━━━━━━━━━━━━━━━━━━━━━━━━
${coursesList}

KEY BOOTCAMP FEATURES (apply to all programs):
• 60+ hiring drives every month
• 200+ US hiring partners (Amazon, Google, Microsoft, Salesforce, Netflix, Stripe, etc.)
• Career assistance & mock interviews
• EMI options available
• Live doubt-clearing sessions
• No upfront tuition for eligible candidates

SALARY RANGES (US market, note: the "fee" field in courses above represents the average US salary for that role):
• $70K–$180K avg salary


PAYMENT OPTIONS (important — answer accurately):
Option 1: No upfront tuition — for eligible candidates
Option 2: Flexible financing — structured repayment up to full program cost
Option 3: Income-based payment (ISA-style) — pay a fixed % of income ONLY after getting a qualifying job, above a defined income threshold. NOT a loan. Payments don't start until you're earning. Not all applicants qualify. Terms vary by program.

━━━━━━━━━━━━━━━━━━━━━━━━━
IT SERVICES WE OFFER (${servicesConfig.length} services):
━━━━━━━━━━━━━━━━━━━━━━━━━
${servicesList}

RESPONSE GUIDELINES:
1. TONE: Friendly, concise, helpful — like a knowledgeable senior friend, not a salesperson
2. STRUCTURE: 1-2 sentences for simple queries; use "•" bullet points for lists
3. COURSES: When asked about a bootcamp, mention avg US salary target, EMI, duration, modes, and 1-2 highlights
4. PAYMENT OPTIONS: Always mention all 3 options when fees are asked. Be precise — ISA is not a loan, payments only start after employment above threshold
5. SERVICES: When asked about a service, mention what we build and invite them to get a free quote
6. COMPARISON: If a user seems unsure between courses, ask about their background and goals, then recommend
7. NEXT STEPS: Always end with a clear next step — e.g., "Book a free callback at /contact" or "WhatsApp us at +1 307 998 3803"
8. CAREER OUTCOMES: When asked about jobs/salaries, mention realistic US market salary ranges. Note: career assistance is comprehensive but outcomes are not guaranteed.
9. US FOCUS: All content is US-focused. Hiring partners are US companies. Salaries are in USD.

IMPORTANT DISCLOSURES (include when relevant):
• Income-based payment option is not a loan
• Payments apply only when income exceeds defined threshold
• Not all applicants qualify for all payment options
• Career outcomes are not guaranteed — we provide access to opportunities and comprehensive support
• Terms vary by program and agreement

OUT-OF-SCOPE TOPICS:
For questions completely unrelated to tech education or software services:
Politely redirect: "I'm here to help with Aartechus bootcamps, IT services, and career opportunities in the US market. Can I help you with any of those?"

REMEMBER: Be warm, honest, and helpful. Always represent Aartechus accurately. Focus on US market context.`;
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleCall = () => { window.location.href = "tel:+13079983803"; };
  const handleEmail = () => {
    window.location.href = "mailto:hello@aartechus.com?subject=Inquiry%20from%20Aartechus%20Website&body=Hello%20Aartechus%20Team,%0D%0A%0D%0AI'm%20interested%20in%20learning%20more%20about%20your%20bootcamps%20and%20services.%0D%0A%0D%0A";
  };
  const handleWebsite = () => { window.open("https://aartechus.com", "_blank"); };

  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const extractServiceLinks = (content) => {
    const contentLower = content.toLowerCase();
    const scored = servicesConfig.map((s) => {
      let score = 0;
      const titleLower = s.title.toLowerCase();
      if (contentLower.includes(titleLower)) score += 1000;
      const words = titleLower.split(/\s+/);
      if (words.length > 1 && words.every((w) => new RegExp(`\\b${escapeRegex(w)}\\b`, "i").test(contentLower))) score += 800;
      if (s.keywords) s.keywords.forEach((kw) => {
        if (new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`, "i").test(contentLower)) score += 500;
      });
      return { slug: s.slug, score };
    });
    return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.slug);
  };

  const extractCourseLinks = (content) => {
    const contentLower = content.toLowerCase();
    const scored = coursesConfig.map((c) => {
      let score = 0;
      const titleLower = c.title.toLowerCase();
      if (contentLower.includes(titleLower)) score += 1000;
      c.keywords.forEach((kw) => {
        if (new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`, "i").test(contentLower)) score += 500;
      });
      return { id: c.id, href: c.href, title: c.title, score };
    });
    return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 2).map((x) => x.id);
  };

  const handleServiceLinkClick = (slug) => { window.open(`/it-services/#${slug}`, "_blank"); };
  const handleCourseLinkClick = (href) => { window.open(href, "_blank"); };

  const formatMessage = (content) => {
    const lines = content.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("**") && line.endsWith("**")) {
        return <p key={i} className="font-bold text-sm mt-2 mb-1">{line.slice(2, -2)}</p>;
      }
      if (line.startsWith("• ") || line.startsWith("- ")) {
        return (
          <div key={i} className="flex gap-2 text-sm">
            <span className="text-primary mt-0.5">•</span>
            <span>{line.slice(2)}</span>
          </div>
        );
      }
      if (line.trim() === "") return <div key={i} className="h-1" />;
      return <p key={i} className="text-sm">{line}</p>;
    });
  };

  const formatTime = (date) => date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const sendMessage = async (text) => {
    const userText = (text || input).trim();
    if (!userText) return;

    const userMsg = { role: "user", content: userText, timestamp: new Date() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            ...updatedMessages.map((msg) => ({ role: msg.role, content: msg.content })),
          ],
        }),
      });

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || "Error getting response";
      const serviceLinks = extractServiceLinks(reply);
      const courseLinks = extractCourseLinks(reply);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply, timestamp: new Date(), serviceLinks, courseLinks },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I'm having connectivity issues. Please reach us directly at hello@aartechus.com or call +1 307 998 3803.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const quickReplies = [
    "Which bootcamp is best for me?",
    "What are the payment options?",
    "What's the average US salary?",
    "Tell me about IT services",
  ];

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-blue-700 text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        animate={isOpen ? {} : { y: [0, -4, 0] }}
        transition={isOpen ? {} : { repeat: Infinity, duration: 3 }}
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </motion.button>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-50 w-[360px] sm:w-[400px] h-[580px] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-primary to-blue-700 text-white p-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-start gap-3 flex-1">
                <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/20 text-xl">
                  🎓
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-base leading-tight">Arty — Aartechus</h3>
                  <p className="text-xs text-blue-100 mt-0.5">Bootcamps, Services & Careers</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <motion.span
                      className="w-2 h-2 bg-emerald-400 rounded-full shadow-lg"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    <span className="text-xs text-emerald-300 font-medium">Online 24/7</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-white/15 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick contact bar */}
            <div className="bg-slate-50 dark:bg-slate-800 p-2.5 border-b border-slate-200 dark:border-slate-700 flex gap-2">
              <button onClick={handleCall} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 bg-white dark:bg-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 hover:text-emerald-700 transition-all shadow-sm border border-slate-200 dark:border-slate-600">
                <Phone className="w-3.5 h-3.5" /> Call
              </button>
              <button onClick={handleEmail} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 bg-white dark:bg-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-blue-50 hover:text-blue-700 transition-all shadow-sm border border-slate-200 dark:border-slate-600">
                <Mail className="w-3.5 h-3.5" /> Email
              </button>
              <button onClick={handleWebsite} className="flex items-center justify-center gap-1.5 px-2 py-2 bg-white dark:bg-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-purple-50 hover:text-purple-700 transition-all shadow-sm border border-slate-200 dark:border-slate-600">
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex gap-2.5 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center shadow-md text-sm ${message.role === "user" ? "bg-gradient-to-br from-slate-700 to-slate-800 text-white" : "bg-gradient-to-br from-primary to-blue-700 text-white ring-2 ring-blue-200 dark:ring-blue-900"}`}>
                    {message.role === "user" ? <User className="w-4 h-4" /> : "🎓"}
                  </div>

                  <div className="flex-1 max-w-[85%]">
                    <div className={`rounded-2xl px-3.5 py-2.5 shadow-md ${message.role === "user" ? "bg-gradient-to-br from-primary to-blue-700 text-white rounded-br-md" : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-md border border-slate-200 dark:border-slate-700"}`}>
                      <div className="text-sm leading-relaxed">{formatMessage(message.content)}</div>
                    </div>

                    {message.serviceLinks?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.serviceLinks.map((slug, idx) => {
                          const svc = servicesConfig.find((s) => s.slug === slug);
                          return (
                            <button key={idx} onClick={() => handleServiceLinkClick(slug)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-medium hover:bg-blue-100 transition-all border border-blue-200 dark:border-blue-800">
                              <Link2 className="w-3 h-3" />
                              {svc?.title || slug.replace(/-/g, " ")}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {message.courseLinks?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {message.courseLinks.map((id, idx) => {
                          const course = coursesConfig.find((c) => c.id === id);
                          if (!course) return null;
                          return (
                            <button key={idx} onClick={() => handleCourseLinkClick(course.href)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-xs font-medium hover:bg-green-100 transition-all border border-green-200 dark:border-green-800">
                              <GraduationCap className="w-3 h-3" />
                              {course.title}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {message.timestamp && (
                      <div className={`text-[10px] text-slate-400 mt-1 px-1 ${message.role === "user" ? "text-right" : "text-left"}`}>
                        {formatTime(message.timestamp)}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {messages.length === 1 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {quickReplies.map((q) => (
                    <button key={q} onClick={() => sendMessage(q)}
                      className="px-3 py-1.5 rounded-full text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-all shadow-sm">
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {isLoading && (
                <div className="flex gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-blue-700 text-white flex items-center justify-center shadow-md ring-2 ring-blue-200 dark:ring-blue-900">🎓</div>
                  <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-md px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 shadow-md">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask about bootcamps..."
                  disabled={isLoading}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 transition-all"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isLoading}
                  className="rounded-xl px-5 h-11 bg-gradient-to-r from-primary to-blue-700 hover:opacity-90 disabled:from-slate-300 disabled:to-slate-400 shadow-md hover:shadow-lg transition-all text-white font-semibold disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400">
                <span className="font-medium">© 2026 Aartechus</span>
                <span>United States</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Chatbot;