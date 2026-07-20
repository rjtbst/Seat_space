import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState, ReactNode } from "react";



const variants = {
  up: { hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0 } },
  left: { hidden: { opacity: 0, x: -40 }, visible: { opacity: 1, x: 0 } },
  right: { hidden: { opacity: 0, x: 40 }, visible: { opacity: 1, x: 0 } },
  none: { hidden: { opacity: 0 }, visible: { opacity: 1 } },
};

const AnimatedSection = ({ children, className = "", delay = 0, direction = "up" }) => (
  <motion.div
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, margin: "-60px" }}
    transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    variants={variants[direction]}
    className={className}
  >
    {children}
  </motion.div>
);

export default AnimatedSection;

/* Counter with rolling animation */
export const RollingCounter = ({ end, suffix = "", prefix = "", label, duration = 2 }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = end / (duration * 60);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [inView, end, duration]);

  return (
    <div ref={ref} className="text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary-foreground/60 mb-2">{label}</p>
      <p className="text-4xl md:text-5xl font-display font-bold text-primary-foreground">
        {prefix}{count.toLocaleString()}{suffix}
      </p>
    </div>
  );
};
