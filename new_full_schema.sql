


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."alert_delivery_status" AS ENUM (
    'pending',
    'delivered',
    'failed'
);


ALTER TYPE "public"."alert_delivery_status" OWNER TO "postgres";


CREATE TYPE "public"."alert_severity" AS ENUM (
    'info',
    'warning',
    'critical'
);


ALTER TYPE "public"."alert_severity" OWNER TO "postgres";


CREATE TYPE "public"."book_status" AS ENUM (
    'available',
    'issued',
    'reserved',
    'lost'
);


ALTER TYPE "public"."book_status" OWNER TO "postgres";


CREATE TYPE "public"."booking_status" AS ENUM (
    'held',
    'confirmed',
    'cancelled',
    'expired',
    'completed',
    'checked_in',
    'no_show'
);


ALTER TYPE "public"."booking_status" OWNER TO "postgres";


CREATE TYPE "public"."chat_owner_type" AS ENUM (
    'user',
    'guest'
);


ALTER TYPE "public"."chat_owner_type" OWNER TO "postgres";


CREATE TYPE "public"."chat_role" AS ENUM (
    'system',
    'user',
    'assistant',
    'tool'
);


ALTER TYPE "public"."chat_role" OWNER TO "postgres";


CREATE TYPE "public"."clawback_status" AS ENUM (
    'pending',
    'recovering',
    'recovered',
    'waived'
);


ALTER TYPE "public"."clawback_status" OWNER TO "postgres";


CREATE TYPE "public"."escrow_status" AS ENUM (
    'not_applicable',
    'held',
    'eligible',
    'paid_out',
    'refunded',
    'cancelled'
);


ALTER TYPE "public"."escrow_status" OWNER TO "postgres";


CREATE TYPE "public"."library_approval_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'suspended'
);


ALTER TYPE "public"."library_approval_status" OWNER TO "postgres";


CREATE TYPE "public"."notification_channel" AS ENUM (
    'email',
    'whatsapp',
    'in_app'
);


ALTER TYPE "public"."notification_channel" OWNER TO "postgres";


CREATE TYPE "public"."notification_status" AS ENUM (
    'pending',
    'sent',
    'delivered',
    'read',
    'failed'
);


ALTER TYPE "public"."notification_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'paid',
    'failed',
    'refunded',
    'partially_refunded'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."payout_destination_type" AS ENUM (
    'bank_account',
    'vpa'
);


ALTER TYPE "public"."payout_destination_type" OWNER TO "postgres";


CREATE TYPE "public"."payout_status" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'reversed'
);


ALTER TYPE "public"."payout_status" OWNER TO "postgres";


CREATE TYPE "public"."plan_scope" AS ENUM (
    'library',
    'cross'
);


ALTER TYPE "public"."plan_scope" OWNER TO "postgres";


CREATE TYPE "public"."platform_payment_status" AS ENUM (
    'created',
    'authorized',
    'captured',
    'failed',
    'refunded'
);


ALTER TYPE "public"."platform_payment_status" OWNER TO "postgres";


CREATE TYPE "public"."platform_subscription_status" AS ENUM (
    'created',
    'pending',
    'active',
    'past_due',
    'halted',
    'cancelled',
    'expired'
);


ALTER TYPE "public"."platform_subscription_status" OWNER TO "postgres";


CREATE TYPE "public"."refund_status" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);


ALTER TYPE "public"."refund_status" OWNER TO "postgres";


CREATE TYPE "public"."refund_type" AS ENUM (
    'full',
    'partial'
);


ALTER TYPE "public"."refund_type" OWNER TO "postgres";


CREATE TYPE "public"."subscription_status" AS ENUM (
    'active',
    'expired',
    'cancelled',
    'pending'
);


ALTER TYPE "public"."subscription_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'student',
    'owner',
    'staff',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."webhook_processing_status" AS ENUM (
    'received',
    'processing',
    'completed',
    'failed'
);


ALTER TYPE "public"."webhook_processing_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_booking_extension_captured"("p_booking_id" "uuid", "p_expected_user_id" "uuid", "p_new_end_time" timestamp without time zone, "p_razorpay_order_id" "text", "p_razorpay_payment_id" "text", "p_commission_bps" integer DEFAULT 700) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_booking      public.bookings%ROWTYPE;
  v_payment      public.payments%ROWTYPE;
  v_commission   numeric;
  v_owner_amount numeric;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking_not_found');
  END IF;

  IF v_booking.user_id IS DISTINCT FROM p_expected_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_owner');
  END IF;

  IF v_booking.end_time = p_new_end_time THEN
    RETURN jsonb_build_object('success', true, 'booking_id', v_booking.id, 'already_applied', true);
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE booking_id = p_booking_id AND razorpay_order_id = p_razorpay_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'payment_row_missing');
  END IF;

  IF v_payment.status NOT IN ('pending', 'paid') THEN
    RETURN jsonb_build_object('success', false, 'error', format('payment_status_%s', v_payment.status));
  END IF;

  IF v_payment.status = 'pending' THEN
    IF v_payment.base_amount IS NOT NULL THEN
      v_owner_amount := v_payment.base_amount;
      v_commission   := v_payment.amount - v_payment.base_amount;
    ELSE
      v_commission   := round((v_payment.amount * p_commission_bps) / 10000.0);
      v_owner_amount := v_payment.amount - v_commission;
    END IF;

    UPDATE public.payments
    SET status                     = 'paid',
        razorpay_payment_id        = p_razorpay_payment_id,
        escrow_status               = 'held',
        commission_rate_bps        = p_commission_bps,
        platform_commission_amount = v_commission,
        owner_payout_amount        = v_owner_amount
    WHERE id = v_payment.id AND status = 'pending';
  END IF;

  PERFORM set_config('app.bypass_student_booking_guard', 'on', true);

  BEGIN
    UPDATE public.bookings SET end_time = p_new_end_time WHERE id = v_booking.id;
  EXCEPTION WHEN exclusion_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'seat_conflict');
  END;

  PERFORM public.log_financial_event(
    'payment', v_payment.id, 'extension_captured', v_payment.amount,
    jsonb_build_object('end_time', v_booking.end_time),
    jsonb_build_object('end_time', p_new_end_time),
    'system', NULL, NULL,
    jsonb_build_object('razorpay_payment_id', p_razorpay_payment_id, 'booking_id', v_booking.id)
  );

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking.id, 'new_end_time', p_new_end_time);
END;
$$;


ALTER FUNCTION "public"."confirm_booking_extension_captured"("p_booking_id" "uuid", "p_expected_user_id" "uuid", "p_new_end_time" timestamp without time zone, "p_razorpay_order_id" "text", "p_razorpay_payment_id" "text", "p_commission_bps" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."confirm_booking_extension_captured"("p_booking_id" "uuid", "p_expected_user_id" "uuid", "p_new_end_time" timestamp without time zone, "p_razorpay_order_id" "text", "p_razorpay_payment_id" "text", "p_commission_bps" integer) IS 'Same fee-on-top-aware split as confirm_booking_payment_captured, applied to extension payments.';



CREATE OR REPLACE FUNCTION "public"."confirm_booking_payment_captured"("p_booking_id" "uuid", "p_expected_user_id" "uuid", "p_razorpay_order_id" "text", "p_razorpay_payment_id" "text", "p_commission_bps" integer DEFAULT 700, "p_actor_type" "text" DEFAULT 'system'::"text", "p_actor_id" "uuid" DEFAULT NULL::"uuid", "p_webhook_event_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_booking       public.bookings%ROWTYPE;
  v_payment       public.payments%ROWTYPE;
  v_commission    numeric;
  v_owner_amount  numeric;
  v_owner_id      uuid;
  v_grace         constant interval := interval '2 minutes';
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking_not_found');
  END IF;

  IF p_expected_user_id IS NOT NULL AND v_booking.user_id IS DISTINCT FROM p_expected_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_owner');
  END IF;

  IF v_booking.status = 'confirmed' THEN
    RETURN jsonb_build_object('success', true, 'booking_id', v_booking.id, 'already_confirmed', true);
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE booking_id = p_booking_id AND razorpay_order_id = p_razorpay_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'payment_row_missing');
  END IF;

  IF v_payment.status NOT IN ('pending', 'paid') THEN
    RETURN jsonb_build_object('success', false, 'error', format('payment_status_%s', v_payment.status));
  END IF;

  IF v_booking.status <> 'held' THEN
    IF v_payment.status IN ('pending', 'paid') THEN
      SELECT owner_id INTO v_owner_id FROM public.libraries WHERE id = v_booking.library_id;
      BEGIN
        PERFORM public.create_refund_if_within_balance(
          v_payment.id, v_payment.amount, 'full',
          'Payment captured after the seat hold had already expired/been cancelled — auto-flagged for admin refund review',
          NULL, NULL, v_booking.id, v_booking.user_id, v_booking.library_id, v_owner_id,
          false, "extensions".uuid_generate_v4()::text
        );
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE 'REFUND_EXCEEDS_BALANCE%' THEN
          RAISE;
        END IF;
      END;
      PERFORM public.log_financial_event(
        'payment', v_payment.id, 'capture_booking_confirm_failed', v_payment.amount,
        jsonb_build_object('booking_status', v_booking.status),
        jsonb_build_object('refund_flagged', true),
        p_actor_type, p_actor_id, p_webhook_event_id,
        jsonb_build_object('booking_id', v_booking.id)
      );
    END IF;
    RETURN jsonb_build_object('success', false, 'error', format('booking_status_%s_refund_flagged', v_booking.status));
  END IF;

  IF v_booking.hold_expires_at IS NOT NULL AND now() > (v_booking.hold_expires_at + v_grace) THEN
    SELECT owner_id INTO v_owner_id FROM public.libraries WHERE id = v_booking.library_id;
    BEGIN
      PERFORM public.create_refund_if_within_balance(
        v_payment.id, v_payment.amount, 'full',
        'Seat hold expired before payment could be confirmed — auto-flagged for admin refund review',
        NULL, NULL, v_booking.id, v_booking.user_id, v_booking.library_id, v_owner_id,
        false, "extensions".uuid_generate_v4()::text
      );
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'REFUND_EXCEEDS_BALANCE%' THEN
        RAISE;
      END IF;
    END;
    PERFORM set_config('app.bypass_student_booking_guard', 'on', true);
    UPDATE public.bookings SET status = 'cancelled' WHERE id = v_booking.id AND status = 'held';
    RETURN jsonb_build_object('success', false, 'error', 'hold_expired_refund_flagged');
  END IF;

  IF v_payment.status = 'pending' THEN
    IF v_payment.base_amount IS NOT NULL THEN
      v_owner_amount := v_payment.base_amount;
      v_commission   := v_payment.amount - v_payment.base_amount;
    ELSE
      v_commission   := round((v_payment.amount * p_commission_bps) / 10000.0);
      v_owner_amount := v_payment.amount - v_commission;
    END IF;

    UPDATE public.payments
    SET status                     = 'paid',
        razorpay_payment_id        = p_razorpay_payment_id,
        escrow_status               = 'held',
        commission_rate_bps        = p_commission_bps,
        platform_commission_amount = v_commission,
        owner_payout_amount        = v_owner_amount
    WHERE id = v_payment.id AND status = 'pending';
  END IF;

  PERFORM set_config('app.bypass_student_booking_guard', 'on', true);
  UPDATE public.bookings
  SET status = 'confirmed', hold_expires_at = NULL
  WHERE id = v_booking.id AND status = 'held';

  PERFORM public.log_financial_event(
    'payment', v_payment.id, 'captured', v_payment.amount,
    jsonb_build_object('payment_status', v_payment.status, 'booking_status', v_booking.status),
    jsonb_build_object('payment_status', 'paid', 'booking_status', 'confirmed'),
    p_actor_type, p_actor_id, p_webhook_event_id,
    jsonb_build_object('razorpay_payment_id', p_razorpay_payment_id, 'razorpay_order_id', p_razorpay_order_id, 'booking_id', v_booking.id)
  );

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking.id);
END;
$$;


ALTER FUNCTION "public"."confirm_booking_payment_captured"("p_booking_id" "uuid", "p_expected_user_id" "uuid", "p_razorpay_order_id" "text", "p_razorpay_payment_id" "text", "p_commission_bps" integer, "p_actor_type" "text", "p_actor_id" "uuid", "p_webhook_event_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."confirm_booking_payment_captured"("p_booking_id" "uuid", "p_expected_user_id" "uuid", "p_razorpay_order_id" "text", "p_razorpay_payment_id" "text", "p_commission_bps" integer, "p_actor_type" "text", "p_actor_id" "uuid", "p_webhook_event_id" "uuid") IS 'Single atomic transition for booking held->confirmed + payment pending->paid, shared by the client-confirm server action and the payment.captured webhook so the two can never diverge. If payments.base_amount is set (fee-on-top model), the owner receives base_amount exactly and the commission is the remainder of the gross; otherwise falls back to legacy commission-deducted math. Service-role only — callers MUST have already verified the Razorpay signature/webhook signature before invoking this.';



CREATE OR REPLACE FUNCTION "public"."create_held_booking_with_payment"("p_user_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone, "p_hold_expires_at" timestamp without time zone, "p_amount" numeric, "p_razorpay_order_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_booking_id uuid;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated_as_owner');
  END IF;

  PERFORM set_config('app.bypass_student_booking_guard', 'on', true);

  BEGIN
    INSERT INTO public.bookings
      (user_id, library_id, seat_id, start_time, end_time, status, hold_expires_at, booking_mode)
    VALUES
      (p_user_id, p_library_id, p_seat_id, p_start_time, p_end_time, 'held', p_hold_expires_at, 'online')
    RETURNING id INTO v_booking_id;
  EXCEPTION WHEN exclusion_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'seat_conflict');
  END;

  BEGIN
    INSERT INTO public.payments (user_id, booking_id, amount, status, razorpay_order_id)
    VALUES (p_user_id, v_booking_id, p_amount, 'pending', p_razorpay_order_id);
  EXCEPTION WHEN unique_violation THEN
    -- Duplicate order id or duplicate pending payment somehow reused —
    -- roll back the booking too (exception inside a function body rolls
    -- back everything done in this function call, including the INSERT
    -- above, since it's all one transaction).
    RAISE EXCEPTION 'DUPLICATE_PAYMENT_ORDER';
  END;

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$$;


ALTER FUNCTION "public"."create_held_booking_with_payment"("p_user_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone, "p_hold_expires_at" timestamp without time zone, "p_amount" numeric, "p_razorpay_order_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_held_booking_with_payment"("p_user_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone, "p_hold_expires_at" timestamp without time zone, "p_amount" numeric, "p_razorpay_order_id" "text") IS 'Atomically creates a held booking + its pending payment row. If the payment insert fails for any reason, the booking insert rolls back too — a held booking can no longer exist without a matching payment row. Callable by authenticated users for their own user_id only; the Razorpay order itself must already exist (created by the server action before calling this).';



CREATE OR REPLACE FUNCTION "public"."create_held_booking_with_payment"("p_user_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone, "p_hold_expires_at" timestamp without time zone, "p_amount" numeric, "p_razorpay_order_id" "text", "p_base_amount" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_booking_id uuid;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated_as_owner');
  END IF;

  PERFORM set_config('app.bypass_student_booking_guard', 'on', true);

  -- (1) One active hold per student, matching how BookMyShow/bus-booking
  -- style flows work -- picking a new seat/time abandons whatever this
  -- same student was previously holding, instantly, not after a timer.
  -- Scoped to this user's own 'held' rows only, so it can never touch
  -- another student's hold or a real confirmed booking. Fails the
  -- matching pending payment FIRST (needs the booking_id link before the
  -- booking's own state changes) -- same order sweep_expire_stale_holds
  -- already uses, so no payment row is ever left "pending" forever
  -- pointing at a booking that's actually been abandoned.
  UPDATE public.payments p
     SET status = 'failed'
    FROM public.bookings b
   WHERE p.booking_id = b.id
     AND b.user_id = p_user_id
     AND b.status = 'held'
     AND p.status = 'pending';

  UPDATE public.bookings
     SET status = 'cancelled'
   WHERE user_id = p_user_id
     AND status = 'held';

  -- (2) Clear a stale hold specifically blocking the seat/time this
  -- request wants, regardless of whose hold it was. Only touches rows
  -- that have ALREADY expired (hold_expires_at < now()) -- an active
  -- hold from another student still correctly blocks this insert via
  -- the EXCLUDE constraint below, exactly as intended. Same
  -- payment-first ordering as above.
  UPDATE public.payments p
     SET status = 'failed'
    FROM public.bookings b
   WHERE p.booking_id = b.id
     AND b.seat_id = p_seat_id
     AND b.status = 'held'
     AND b.hold_expires_at < now()
     AND tsrange(b.start_time, b.end_time, '[)') && tsrange(p_start_time, p_end_time, '[)')
     AND p.status = 'pending';

  UPDATE public.bookings
     SET status = 'cancelled'
   WHERE seat_id = p_seat_id
     AND status = 'held'
     AND hold_expires_at < now()
     AND tsrange(start_time, end_time, '[)') && tsrange(p_start_time, p_end_time, '[)');

  BEGIN
    INSERT INTO public.bookings
      (user_id, library_id, seat_id, start_time, end_time, status, hold_expires_at, booking_mode)
    VALUES
      (p_user_id, p_library_id, p_seat_id, p_start_time, p_end_time, 'held', p_hold_expires_at, 'online')
    RETURNING id INTO v_booking_id;
  EXCEPTION WHEN exclusion_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'seat_conflict');
  END;

  BEGIN
    INSERT INTO public.payments (user_id, booking_id, amount, base_amount, status, razorpay_order_id)
    VALUES (p_user_id, v_booking_id, p_amount, p_base_amount, 'pending', p_razorpay_order_id);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_PAYMENT_ORDER';
  END;

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$$;


ALTER FUNCTION "public"."create_held_booking_with_payment"("p_user_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone, "p_hold_expires_at" timestamp without time zone, "p_amount" numeric, "p_razorpay_order_id" "text", "p_base_amount" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_held_booking_with_payment"("p_user_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone, "p_hold_expires_at" timestamp without time zone, "p_amount" numeric, "p_razorpay_order_id" "text", "p_base_amount" numeric) IS 'Atomically creates a held booking + its pending payment row. Before inserting, releases (a) any of this student''s own still-"held" bookings elsewhere -- one active hold per student -- and (b) any already-expired "held" row specifically blocking this seat/time, so a seat the availability grid shows as free can never fail with a stale seat_conflict. p_amount is the GROSS amount charged via Razorpay; p_base_amount is the library''s listed price alone. If the payment insert fails, the booking insert rolls back too.';



CREATE OR REPLACE FUNCTION "public"."create_pending_subscription_with_payment"("p_user_id" "uuid", "p_plan_id" "uuid", "p_library_id" "uuid", "p_razorpay_order_id" "text", "p_expected_total" numeric, "p_coupon_code" "text" DEFAULT NULL::"text", "p_commission_bps" integer DEFAULT 500) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plan              public.plans%ROWTYPE;
  v_coupon            public.coupons%ROWTYPE;
  v_base_price        numeric;
  v_discount_amount   numeric := 0;
  v_coupon_id         uuid := NULL;
  v_user_redemptions  integer;
  v_platform_fee      numeric;
  v_total_payable     numeric;
  v_sub_id            uuid;
  v_start_ts          timestamp without time zone;
  v_end_ts            timestamp without time zone;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated_as_owner');
  END IF;

  -- Plan ↔ library link must exist (same check the old application-level
  -- code did, now inside the atomic function).
  IF NOT EXISTS (
    SELECT 1 FROM public.plan_libraries
    WHERE plan_id = p_plan_id AND library_id = p_library_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'plan_not_available_for_library');
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'plan_not_found');
  END IF;

  v_base_price := COALESCE(v_plan.price, 0);
  IF v_base_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_plan_price');
  END IF;

  -- Block duplicate active subscriptions to the same plan.
  IF EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = p_user_id AND plan_id = p_plan_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_subscribed');
  END IF;

  -- ── Coupon validation + application ──────────────────────────────────
  IF p_coupon_code IS NOT NULL AND btrim(p_coupon_code) <> '' THEN
    -- Row lock: two concurrent redemptions of a coupon near its
    -- max_redemptions limit must serialize here, not both read the same
    -- pre-increment times_redeemed and both pass the check.
    SELECT * INTO v_coupon FROM public.coupons
    WHERE owner_id = v_plan.owner_id AND code = upper(btrim(p_coupon_code))
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_coupon');
    END IF;
    IF NOT v_coupon.is_active THEN
      RETURN jsonb_build_object('success', false, 'error', 'coupon_inactive');
    END IF;
    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
      RETURN jsonb_build_object('success', false, 'error', 'coupon_expired');
    END IF;
    IF v_coupon.plan_id IS NOT NULL AND v_coupon.plan_id <> p_plan_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'coupon_not_valid_for_plan');
    END IF;
    IF v_coupon.max_redemptions IS NOT NULL AND v_coupon.times_redeemed >= v_coupon.max_redemptions THEN
      RETURN jsonb_build_object('success', false, 'error', 'coupon_limit_reached');
    END IF;

    SELECT count(*) INTO v_user_redemptions
    FROM public.coupon_redemptions
    WHERE coupon_id = v_coupon.id AND user_id = p_user_id;

    IF v_user_redemptions >= v_coupon.max_redemptions_per_user THEN
      RETURN jsonb_build_object('success', false, 'error', 'coupon_already_used');
    END IF;

    IF v_coupon.discount_type = 'percent' THEN
      v_discount_amount := round((v_base_price * v_coupon.discount_value) / 100.0);
    ELSE
      v_discount_amount := v_coupon.discount_value;
    END IF;

    -- Always leave at least ₹1 payable — a 100%-off flat coupon (or a
    -- flat discount larger than the plan price) can never make the price
    -- zero or negative. Zero-value orders are also rejected by Razorpay,
    -- so this is a correctness fix as much as an anti-abuse one.
    v_discount_amount := LEAST(v_discount_amount, v_base_price - 1);
    v_coupon_id := v_coupon.id;
  END IF;

  v_base_price := v_base_price - v_discount_amount;

  -- Fee-on-top, computed on the DISCOUNTED price — the platform's 5% take
  -- scales down with the discount rather than taxing the pre-discount
  -- price, matching how the coupon is presented to the student at checkout.
  v_platform_fee  := round((v_base_price * p_commission_bps) / 10000.0);
  v_total_payable := v_base_price + v_platform_fee;

  -- The Razorpay order was already created (by the caller, before this
  -- function runs) for whatever total a PREVIEW computation showed. Coupon
  -- state (times_redeemed, is_active, expiry) can change in the gap
  -- between that preview and this call — so this function recomputes the
  -- discount independently here (its own source of truth, under the row
  -- lock above) and REJECTS rather than silently persists if the two
  -- disagree. This guarantees payments.amount can never diverge from what
  -- Razorpay actually charged; the cost is that a student who loses this
  -- rare race must retry with a fresh preview, which is a minor UX hit in
  -- exchange for a hard financial-integrity guarantee.
  IF abs(v_total_payable - p_expected_total) > 0.01 THEN
    RETURN jsonb_build_object('success', false, 'error', 'price_changed_please_retry');
  END IF;

  v_start_ts := (now() AT TIME ZONE 'Asia/Kolkata')::date::timestamp;
  v_end_ts   := v_start_ts + make_interval(days => COALESCE(v_plan.duration_days, 30)) + interval '23 hours 59 minutes 59 seconds';

  INSERT INTO public.subscriptions (user_id, plan_id, start_date, end_date, status)
  VALUES (p_user_id, p_plan_id, v_start_ts, v_end_ts, 'pending')
  RETURNING id INTO v_sub_id;

  INSERT INTO public.payments
    (user_id, booking_id, amount, base_amount, status, razorpay_order_id,
     subscription_id, commission_rate_bps)
  VALUES
    (p_user_id, NULL, v_total_payable, v_base_price, 'pending', p_razorpay_order_id,
     v_sub_id, p_commission_bps);

  IF v_coupon_id IS NOT NULL THEN
    INSERT INTO public.coupon_redemptions (coupon_id, user_id, subscription_id, discount_amount)
    VALUES (v_coupon_id, p_user_id, v_sub_id, v_discount_amount);

    UPDATE public.coupons SET times_redeemed = times_redeemed + 1 WHERE id = v_coupon_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_sub_id,
    'base_price', v_base_price,
    'discount_amount', v_discount_amount,
    'platform_fee', v_platform_fee,
    'total_payable', v_total_payable
  );
END;
$$;


ALTER FUNCTION "public"."create_pending_subscription_with_payment"("p_user_id" "uuid", "p_plan_id" "uuid", "p_library_id" "uuid", "p_razorpay_order_id" "text", "p_expected_total" numeric, "p_coupon_code" "text", "p_commission_bps" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_refund_if_within_balance"("p_payment_id" "uuid", "p_amount" numeric, "p_refund_type" "public"."refund_type", "p_reason" "text", "p_admin_notes" "text", "p_initiated_by" "uuid", "p_booking_id" "uuid", "p_student_id" "uuid", "p_library_id" "uuid", "p_owner_id" "uuid", "p_payout_already_settled" boolean, "p_idempotency_key" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_original_amount numeric;
  v_already_refunded numeric;
  v_refund_id uuid;
BEGIN
  -- Lock the payment row for the duration of this transaction so a second
  -- concurrent call to this same function for the same payment_id blocks
  -- here until the first commits, then sees its effect in the SUM below.
  -- This row lock is the actual race-closing mechanism -- without it, two
  -- concurrent callers could both compute the SUM from the same pre-insert
  -- snapshot under READ COMMITTED isolation and both pass the check.
  PERFORM 1 FROM public.payments WHERE id = p_payment_id FOR UPDATE;

  SELECT amount INTO v_original_amount FROM public.payments WHERE id = p_payment_id;
  IF v_original_amount IS NULL THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_already_refunded
  FROM public.refunds
  WHERE payment_id = p_payment_id
    AND status IN ('pending', 'processing', 'completed');

  IF v_already_refunded + p_amount > v_original_amount + 0.01 THEN
    RAISE EXCEPTION 'REFUND_EXCEEDS_BALANCE: already refunded/pending %, requested %, original %',
      v_already_refunded, p_amount, v_original_amount;
  END IF;

  INSERT INTO public.refunds
    (payment_id, booking_id, student_id, library_id, owner_id, initiated_by,
     resolved_by, refund_type, status, amount, reason, admin_notes,
     payout_already_settled, idempotency_key)
  VALUES
    (p_payment_id, p_booking_id, p_student_id, p_library_id, p_owner_id, p_initiated_by,
     p_initiated_by, p_refund_type, 'pending', p_amount, p_reason, p_admin_notes,
     p_payout_already_settled, p_idempotency_key)
  RETURNING id INTO v_refund_id;

  RETURN v_refund_id;
END;
$$;


ALTER FUNCTION "public"."create_refund_if_within_balance"("p_payment_id" "uuid", "p_amount" numeric, "p_refund_type" "public"."refund_type", "p_reason" "text", "p_admin_notes" "text", "p_initiated_by" "uuid", "p_booking_id" "uuid", "p_student_id" "uuid", "p_library_id" "uuid", "p_owner_id" "uuid", "p_payout_already_settled" boolean, "p_idempotency_key" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_refund_if_within_balance"("p_payment_id" "uuid", "p_amount" numeric, "p_refund_type" "public"."refund_type", "p_reason" "text", "p_admin_notes" "text", "p_initiated_by" "uuid", "p_booking_id" "uuid", "p_student_id" "uuid", "p_library_id" "uuid", "p_owner_id" "uuid", "p_payout_already_settled" boolean, "p_idempotency_key" "text") IS 'Atomic check-and-insert for refund creation. Locks the payment row (FOR UPDATE) so concurrent refund attempts against the same payment serialize correctly instead of racing past an application-level balance check. Raises REFUND_EXCEEDS_BALANCE if the requested amount would push total refunds over the original payment amount.';



CREATE OR REPLACE FUNCTION "public"."create_subscription_covered_booking"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sub          public.subscriptions%ROWTYPE;
  v_plan         public.plans%ROWTYPE;
  v_booking_id   uuid;
  v_used_count   integer;
  v_is_self      boolean;
  v_is_staff     boolean;
BEGIN
  v_is_self  := auth.uid() = p_user_id;
  v_is_staff := EXISTS (SELECT 1 FROM public.libraries WHERE id = p_library_id AND owner_id = auth.uid())
             OR EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND library_id = p_library_id);

  IF NOT v_is_self AND NOT v_is_staff THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions
  WHERE id = p_subscription_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;
  IF v_sub.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_active');
  END IF;
  IF v_sub.end_date IS NOT NULL AND v_sub.end_date < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_expired');
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = v_sub.plan_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'plan_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.plan_libraries
    WHERE plan_id = v_plan.id AND library_id = p_library_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'plan_not_valid_for_library');
  END IF;

  IF v_plan.time_window_start IS NOT NULL THEN
    IF p_start_time::time < v_plan.time_window_start OR p_end_time::time > v_plan.time_window_end THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'outside_plan_time_window',
        'time_window_start', v_plan.time_window_start,
        'time_window_end', v_plan.time_window_end
      );
    END IF;
  END IF;

  -- Day-of-week check: both the start and end must land on an allowed
  -- day. A booking that starts Friday night and ends past midnight
  -- Saturday needs BOTH days allowed, same "fully contained" principle
  -- as the time-window check above.
  IF v_plan.days_of_week IS NOT NULL THEN
    IF NOT (EXTRACT(DOW FROM p_start_time)::smallint = ANY(v_plan.days_of_week))
       OR NOT (EXTRACT(DOW FROM p_end_time)::smallint = ANY(v_plan.days_of_week)) THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'outside_plan_days',
        'days_of_week', v_plan.days_of_week
      );
    END IF;
  END IF;

  IF v_plan.session_limit IS NOT NULL THEN
    SELECT count(*) INTO v_used_count
    FROM public.bookings
    WHERE subscription_id = p_subscription_id
      AND status IN ('confirmed', 'checked_in', 'completed');

    IF v_used_count >= v_plan.session_limit::integer THEN
      RETURN jsonb_build_object('success', false, 'error', 'session_limit_reached');
    END IF;
  END IF;

  PERFORM set_config('app.bypass_student_booking_guard', 'on', true);

  BEGIN
    INSERT INTO public.bookings
      (user_id, library_id, seat_id, start_time, end_time, status, booking_mode, subscription_id)
    VALUES
      (p_user_id, p_library_id, p_seat_id, p_start_time, p_end_time, 'confirmed',
       CASE WHEN v_is_self THEN 'online' ELSE 'offline' END, p_subscription_id)
    RETURNING id INTO v_booking_id;
  EXCEPTION WHEN exclusion_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'seat_conflict');
  END;

  INSERT INTO public.payments
    (user_id, booking_id, amount, base_amount, status, subscription_id,
     commission_rate_bps, escrow_status)
  VALUES
    (p_user_id, v_booking_id, 0, 0, 'paid', p_subscription_id, 0, 'not_applicable');

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$$;


ALTER FUNCTION "public"."create_subscription_covered_booking"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_booking_self_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Trusted internal RPCs (confirm_booking_payment_captured,
  -- confirm_booking_extension_captured, cron/system functions) set this
  -- transaction-local flag before writing and are exempt.
  IF current_setting('app.bypass_student_booking_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- No JWT in session (service-role / DB-internal callers, e.g. pg_cron
  -- functions) — not a student-originated write, exempt.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Anyone other than the booking's own student (staff/owner acting under
  -- their own RLS policies) is out of scope for this guard.
  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- The ONLY thing a student may do to their own booking directly is
  -- self-cancel a held or confirmed booking, changing nothing else.
  IF NEW.status = 'cancelled' AND OLD.status IN ('held', 'confirmed') THEN
    IF NEW.library_id       IS DISTINCT FROM OLD.library_id
       OR NEW.seat_id       IS DISTINCT FROM OLD.seat_id
       OR NEW.start_time    IS DISTINCT FROM OLD.start_time
       OR NEW.end_time      IS DISTINCT FROM OLD.end_time
       OR NEW.checked_in_at IS DISTINCT FROM OLD.checked_in_at
       OR NEW.hold_expires_at IS DISTINCT FROM OLD.hold_expires_at
    THEN
      RAISE EXCEPTION 'Only the status column may change when self-cancelling a booking';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'This booking update is not permitted directly — use the appropriate action (confirm payment, extend, or cancel).';
END;
$$;


ALTER FUNCTION "public"."enforce_booking_self_update"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."enforce_booking_self_update"() IS 'Real authority behind bookings UPDATE (RLS only checks ownership). Students may self-cancel a held/confirmed booking and nothing else; every other transition must go through a SECURITY DEFINER RPC that sets app.bypass_student_booking_guard first. Staff/owner writes are unaffected.';



CREATE OR REPLACE FUNCTION "public"."enforce_library_activation_requirements"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Only check when is_active is actually being turned ON (or was already
  -- on at INSERT time) — turning it OFF, or any other column update, is
  -- never blocked by this trigger.
  IF NEW.is_active = true AND (TG_OP = 'INSERT' OR OLD.is_active IS DISTINCT FROM true) THEN
    IF NEW.approval_status <> 'approved' THEN
      RAISE EXCEPTION 'LIBRARY_NOT_APPROVED: cannot activate a library that is not admin-approved (current status: %)', NEW.approval_status;
    END IF;

    IF NOT public.has_active_platform_subscription(NEW.id) THEN
      RAISE EXCEPTION 'SUBSCRIPTION_REQUIRED: cannot activate a library without an active platform subscription';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_library_activation_requirements"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."enforce_library_activation_requirements"() IS 'Defense-in-depth: blocks is_active from being set to true at the database level unless the library is approved and has an active platform subscription, regardless of which code path attempts it. App-layer checks (publishLibrary, toggleLibraryActive) should still run first to give a friendly error message — this trigger is the backstop, not the primary UX.';



CREATE OR REPLACE FUNCTION "public"."expire_holds_before_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.bookings
  SET    status = 'cancelled'
  WHERE  status         = 'held'
    AND  seat_id        = NEW.seat_id
    AND  hold_expires_at < NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."expire_holds_before_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_stale_holds"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  cancelled_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.bookings
    SET status = 'cancelled'
    WHERE status = 'held'
      AND hold_expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO cancelled_count FROM expired;
  RETURN cancelled_count;
END;
$$;


ALTER FUNCTION "public"."expire_stale_holds"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_stuck_pending_payments"("p_older_than" interval DEFAULT '00:30:00'::interval) RETURNS TABLE("payment_id" "uuid", "booking_id" "uuid", "razorpay_order_id" "text", "amount" numeric, "created_at" timestamp without time zone, "booking_status" "public"."booking_status")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT p.id, p.booking_id, p.razorpay_order_id, p.amount, p.created_at, b.status
  FROM public.payments p
  LEFT JOIN public.bookings b ON b.id = p.booking_id
  WHERE p.status = 'pending'
    AND p.created_at < now() - p_older_than
  ORDER BY p.created_at ASC;
END;
$$;


ALTER FUNCTION "public"."find_stuck_pending_payments"("p_older_than" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.users (id, email, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    'student'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_active_platform_subscription"("lib_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.libraries l
    WHERE l.id = lib_id
      AND l.trial_ends_at IS NOT NULL
      AND l.trial_ends_at > now()
  )
  OR EXISTS (
    SELECT 1 FROM public.platform_subscriptions ps
    WHERE ps.library_id = lib_id
      AND (
        ps.status = 'active'
        OR (ps.status = 'past_due'
            AND ps.grace_period_ends_at IS NOT NULL
            AND ps.grace_period_ends_at > now())
      )
  );
$$;


ALTER FUNCTION "public"."has_active_platform_subscription"("lib_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_active_platform_subscription"("lib_id" "uuid") IS 'True if this library may be publicly active: either it has a real active/in-grace Razorpay platform subscription, OR it is within its one-time first-library trial window (libraries.trial_ends_at). Single gate used by the activation trigger, the public-visibility RLS policy, and app-layer go-live checks -- extend here, not at each call site.';



CREATE OR REPLACE FUNCTION "public"."insert_booking_reminders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  WITH expiring AS (
    SELECT
      b.id          AS booking_id,
      b.user_id,
      b.library_id,
      b.seat_id,
      b.end_time,
      l.name        AS library_name,
      s.row_label   || s.column_number::text AS seat_label
    FROM public.bookings b
    JOIN public.libraries l ON l.id = b.library_id
    JOIN public.seats     s ON s.id = b.seat_id
    WHERE b.status   IN ('confirmed', 'checked_in')
      AND b.user_id  IS NOT NULL
      AND b.end_time  > NOW() + INTERVAL '10 minutes'
      AND b.end_time  < NOW() + INTERVAL '20 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.booking_id = b.id
          AND n.event      = 'booking_expiring'
      )
  ),
  inserted AS (
    INSERT INTO public.notifications (
      user_id, library_id, booking_id,
      channel, event, status,
      title, body,
      payload, created_at
    )
    SELECT
      e.user_id,
      e.library_id,
      e.booking_id,
      'in_app'::public.notification_channel,
      'booking_expiring',
      'sent'::public.notification_status,
      'Your seat is expiring soon 🕐',
      'Seat ' || e.seat_label || ' at ' || e.library_name ||
        ' ends in ~15 minutes. Extend your booking to stay longer.',
      jsonb_build_object(
        'booking_id', e.booking_id,
        'seat_label', e.seat_label,
        'library_name', e.library_name,
        'end_time', e.end_time
      ),
      NOW()
    FROM expiring e
    RETURNING id
  )
  SELECT COUNT(*) INTO inserted_count FROM inserted;
  RETURN inserted_count;
END;
$$;


ALTER FUNCTION "public"."insert_booking_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_whatsapp_otp"("p_whatsapp_number" "text", "p_code_hash" "text", "p_expires_at" timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.whatsapp_otp_codes (user_id, whatsapp_number, code_hash, expires_at)
  VALUES (auth.uid(), p_whatsapp_number, p_code_hash, p_expires_at)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."insert_whatsapp_otp"("p_whatsapp_number" "text", "p_code_hash" "text", "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (select auth.uid()) AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_senior_staff_of"("lib_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff
    WHERE user_id = (select auth.uid()) AND library_id = lib_id AND role = 'senior_staff'
  );
$$;


ALTER FUNCTION "public"."is_senior_staff_of"("lib_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff_of"("lib_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff
    WHERE user_id = (select auth.uid()) AND library_id = lib_id
  );
$$;


ALTER FUNCTION "public"."is_staff_of"("lib_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_financial_event"("p_entity_type" "text", "p_entity_id" "uuid", "p_event" "text", "p_amount" numeric DEFAULT NULL::numeric, "p_previous_state" "jsonb" DEFAULT NULL::"jsonb", "p_new_state" "jsonb" DEFAULT NULL::"jsonb", "p_actor_type" "text" DEFAULT 'system'::"text", "p_actor_id" "uuid" DEFAULT NULL::"uuid", "p_webhook_event_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.financial_audit_log
    (entity_type, entity_id, event, amount, previous_state, new_state, actor_type, actor_id, webhook_event_id, metadata)
  VALUES
    (p_entity_type, p_entity_id, p_event, p_amount, p_previous_state, p_new_state, p_actor_type, p_actor_id, p_webhook_event_id, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."log_financial_event"("p_entity_type" "text", "p_entity_id" "uuid", "p_event" "text", "p_amount" numeric, "p_previous_state" "jsonb", "p_new_state" "jsonb", "p_actor_type" "text", "p_actor_id" "uuid", "p_webhook_event_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_escrow_eligible_on_checkin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'checked_in'
     AND (OLD.status IS DISTINCT FROM 'checked_in')
     AND NEW.start_time <= now()
  THEN
    UPDATE public.payments
    SET escrow_status = 'eligible',
        escrow_eligible_at = now()
    WHERE booking_id = NEW.id
      AND status = 'paid'
      AND escrow_status = 'held';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."mark_escrow_eligible_on_checkin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_whatsapp_otp_attempt"("p_id" "uuid", "p_consumed" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.whatsapp_otp_codes
     SET attempts    = CASE WHEN p_consumed THEN attempts ELSE attempts + 1 END,
         consumed_at = CASE WHEN p_consumed THEN now() ELSE consumed_at END
   WHERE id = p_id
     AND user_id = auth.uid(); -- can only ever touch your own OTP rows
END;
$$;


ALTER FUNCTION "public"."mark_whatsapp_otp_attempt"("p_id" "uuid", "p_consumed" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."monthly_revenue"("p_library_id" "uuid", "p_since" timestamp with time zone) RETURNS TABLE("month" "text", "amount" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    to_char(date_trunc('month', b.start_time), 'Mon') AS month,
    -- What the OWNER actually still receives: owner_payout_amount for
    -- online (fee-on-top) bookings — already netted down for any partial
    -- refunds at refund-time — or the full amount for manual/walk-in
    -- bookings where owner_payout_amount is never set (no platform fee
    -- applies there — see escrow.ts).
    COALESCE(SUM(COALESCE(p.owner_payout_amount, p.amount)), 0) AS amount
  FROM bookings b
  LEFT JOIN payments p
    ON p.booking_id = b.id
    AND p.status IN ('paid', 'partially_refunded')
  WHERE b.library_id = p_library_id
    AND b.start_time >= p_since
  GROUP BY date_trunc('month', b.start_time)
  ORDER BY date_trunc('month', b.start_time);
$$;


ALTER FUNCTION "public"."monthly_revenue"("p_library_id" "uuid", "p_since" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."monthly_revenue"("p_library_id" "uuid", "p_since" timestamp with time zone) IS 'Owner-facing monthly revenue chart data. Sums owner_payout_amount (what the owner actually receives), including partially_refunded payments since their remaining owed amount is netted at refund-time — falls back to the full amount for manual/walk-in payments where no platform fee applies. Fixed 2026-07.';



CREATE OR REPLACE FUNCTION "public"."notify_book_request_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_title    text;
  v_lib_name text;
  v_msg_body text;
  v_event    text;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;

  SELECT title INTO v_title    FROM public.books     WHERE id = NEW.book_id;
  SELECT name  INTO v_lib_name FROM public.libraries WHERE id = NEW.library_id;

  IF NEW.status = 'approved' THEN
    v_event    := 'book_request_approved';
    v_msg_body := 'Your request for "' || COALESCE(v_title, 'a book') ||
                  '" has been approved by ' || COALESCE(v_lib_name, 'the library') ||
                  '. Visit the library to collect your book.';
  ELSE
    v_event    := 'book_request_rejected';
    v_msg_body := 'Your request for "' || COALESCE(v_title, 'a book') ||
                  '" was not approved by ' || COALESCE(v_lib_name, 'the library') ||
                  '. You may request a different book.';
  END IF;

  INSERT INTO public.notifications (
    user_id, channel, event, title, body,
    library_id, status, created_at
  ) VALUES (
    NEW.user_id,
    'in_app',
    v_event,
    CASE WHEN NEW.status = 'approved'
         THEN '📚 Book Request Approved'
         ELSE '📚 Book Request Update' END,
    v_msg_body,
    NEW.library_id,
    'sent',
    public.now_ist()
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_book_request_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_user"("p_user_id" "uuid", "p_event" "text", "p_title" "text", "p_body" "text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb", "p_library_id" "uuid" DEFAULT NULL::"uuid", "p_booking_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notifications
    (user_id, channel, event, payload, status, title, body, library_id, booking_id, created_at)
  VALUES
    (p_user_id, 'in_app', p_event, p_payload, 'sent', p_title, p_body, p_library_id, p_booking_id, public.now_ist())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."notify_user"("p_user_id" "uuid", "p_event" "text", "p_title" "text", "p_body" "text", "p_payload" "jsonb", "p_library_id" "uuid", "p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."now_ist"() RETURNS timestamp without time zone
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::timestamp without time zone;
$$;


ALTER FUNCTION "public"."now_ist"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_role_self_elevation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- No-op if role isn't actually changing
  if NEW.role is not distinct from OLD.role then
    return NEW;
  end if;

  -- Direct database access (SQL Editor, psql, migrations) connects as a
  -- role other than 'authenticated'/'anon' — those two are exclusively
  -- what Supabase's API layer uses for real end-user app traffic. This is
  -- intentionally the ONLY way left to grant 'admin': manually, from here.
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;

  -- One-time self-service role pick during onboarding (student/owner/staff
  -- only) — never lets it through if the new value is 'admin'.
  if OLD.onboarded = false and NEW.role <> 'admin' then
    return NEW;
  end if;

  raise exception 'Not authorized to change role';
end;
$$;


ALTER FUNCTION "public"."prevent_role_self_elevation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rate_limit_increment"("p_key" "text", "p_window_seconds" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_window_start timestamp without time zone;
  v_count integer;
BEGIN
  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.rate_limit_counters (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_counters.count + 1
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."rate_limit_increment"("p_key" "text", "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_libraries_by_distance"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision DEFAULT 50, "p_limit" integer DEFAULT 12, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "distance_km" double precision, "total_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  SELECT
    l.id,
    ST_Distance(
      l.geo_point,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) / 1000.0                          AS distance_km,
    count(*) OVER ()                    AS total_count
  FROM public.libraries l
  WHERE l.is_active        = true
    AND l.approval_status  = 'approved'
    AND public.has_active_platform_subscription(l.id)
    AND l.geo_point IS NOT NULL
    AND ST_DWithin(
          l.geo_point,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_km * 1000
        )
  ORDER BY l.geo_point <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  LIMIT  p_limit
  OFFSET p_offset;
$$;


ALTER FUNCTION "public"."search_libraries_by_distance"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_libraries_by_distance"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision, "p_limit" integer, "p_offset" integer) IS 'GPS-mode explore search. Uses GiST-indexed geo_point for radius filter (ST_DWithin) and KNN ordering (<->). total_count is a window-function count over the full match set, fixing the old 200-row JS-side cap.';



CREATE OR REPLACE FUNCTION "public"."set_checked_in_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'checked_in' AND (OLD.status IS DISTINCT FROM 'checked_in') AND NEW.checked_in_at IS NULL THEN
    NEW.checked_in_at := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_checked_in_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_slot_configs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_slot_configs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."slot_has_active_bookings"("p_slot_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.slot_configs sc ON sc.id = p_slot_id
    WHERE b.library_id = sc.library_id
      AND b.status IN ('held', 'confirmed', 'checked_in')
      AND b.end_time > now()
      AND b.start_time::time >= sc.start_time
      AND b.start_time::time <  sc.end_time
      AND (EXTRACT(isodow FROM b.start_time)::int - 1) = ANY (sc.days)
  );
$$;


ALTER FUNCTION "public"."slot_has_active_bookings"("p_slot_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."slot_has_active_bookings"("p_slot_id" "uuid") IS 'True if a slot_configs row still has any not-yet-ended booking (held/confirmed/checked_in) scheduled inside its time window. Used to block owner edits to price/start/end on a slot that already has active bookings — existing bookings must keep the pricing/timing they were created with.';



CREATE OR REPLACE FUNCTION "public"."sweep_complete_ended_bookings"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Checked-in bookings that have ended -> completed, and make sure escrow
  -- is flagged eligible (covers the case where end_time passed AFTER
  -- check-in, which the AFTER UPDATE trigger on check-in could not have
  -- caught yet because end_time was still in the future at that moment).
  UPDATE public.bookings
  SET status = 'completed'
  WHERE status = 'checked_in'
    AND end_time <= now();

  UPDATE public.payments p
  SET escrow_status = 'eligible',
      escrow_eligible_at = now()
  WHERE p.status = 'paid'
    AND p.escrow_status = 'held'
    AND p.booking_id IN (
      SELECT id FROM public.bookings WHERE status = 'completed' AND end_time <= now()
    );

  -- Confirmed bookings that ended with no check-in at all -> no_show.
  -- Escrow is intentionally left as 'held' (NOT auto-eligible, NOT
  -- auto-refunded) — a no-show is a policy judgment call: some platforms
  -- still pay the owner (seat was reserved/blocked), others refund the
  -- student. We surface no_show bookings to admin for manual escrow
  -- resolution rather than guessing in either direction silently.
  UPDATE public.bookings
  SET status = 'no_show'
  WHERE status = 'confirmed'
    AND end_time <= now();
END;
$$;


ALTER FUNCTION "public"."sweep_complete_ended_bookings"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sweep_complete_ended_bookings"() IS 'Scheduled via pg_cron every 5 minutes. Transitions ended bookings to completed/no_show and flips escrow to eligible for completed+paid bookings. See admin_view: no_show bookings need manual escrow resolution.';



CREATE OR REPLACE FUNCTION "public"."sweep_deactivate_expired_trials"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT l.id, l.owner_id, l.name, l.trial_ends_at
    FROM public.libraries l
    WHERE l.is_active = true
      AND NOT public.has_active_platform_subscription(l.id)
  LOOP
    UPDATE public.libraries SET is_active = false WHERE id = r.id;

    PERFORM public.notify_user(
      r.owner_id,
      CASE WHEN r.trial_ends_at IS NOT NULL THEN 'trial_expired' ELSE 'subscription_lapsed' END,
      CASE WHEN r.trial_ends_at IS NOT NULL THEN 'Free trial ended — library offline' ELSE 'Subscription lapsed — library offline' END,
      CASE WHEN r.trial_ends_at IS NOT NULL
        THEN format('Your 14-day free trial for %s has ended and the library has been taken offline. Set up a ₹399/month platform subscription to bring it back online.', r.name)
        ELSE format('%s has been taken offline because its platform subscription is no longer active. Renew your subscription to bring it back online.', r.name)
      END,
      '{}'::jsonb,
      r.id,
      NULL
    );
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."sweep_deactivate_expired_trials"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sweep_deactivate_expired_trials"() IS 'Scheduled via pg_cron, once daily each morning. Deactivates (is_active=false) any library that no longer passes has_active_platform_subscription() -- covers both a first-library trial running out with no paid subscription, and (as a daily backstop alongside the existing 30-minute sweep_expire_lapsed_subscriptions) a real subscription that lapsed. Notifies the owner via notify_user() either way.';



CREATE OR REPLACE FUNCTION "public"."sweep_dead_letter_webhooks"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_stuck_count integer;
  v_failed_count integer;
BEGIN
  SELECT count(*) INTO v_stuck_count
  FROM public.webhook_events
  WHERE status = 'processing' AND received_at < now() - interval '10 minutes';

  SELECT count(*) INTO v_failed_count
  FROM public.webhook_events
  WHERE status = 'failed' AND received_at > now() - interval '30 minutes';

  IF v_stuck_count > 0 THEN
    INSERT INTO public.alert_log (severity, source, title, message, metadata)
    VALUES (
      'critical', 'dead-letter-sweep', 'Webhooks stuck mid-processing',
      v_stuck_count || ' webhook event(s) have been stuck in processing for over 10 minutes -- likely a crashed handler. Check public.webhook_dead_letters.',
      jsonb_build_object('stuck_count', v_stuck_count)
    );
  END IF;

  IF v_failed_count > 0 THEN
    INSERT INTO public.alert_log (severity, source, title, message, metadata)
    VALUES (
      'warning', 'dead-letter-sweep', 'Recent webhook processing failures',
      v_failed_count || ' webhook event(s) failed processing in the last 30 minutes. Check public.webhook_dead_letters.',
      jsonb_build_object('failed_count', v_failed_count)
    );
  END IF;
END;
$$;


ALTER FUNCTION "public"."sweep_dead_letter_webhooks"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sweep_dead_letter_webhooks"() IS 'Runs every 5 minutes. Writes directly to alert_log (no HTTP call needed) when webhooks are stuck mid-processing or have recently failed -- the flush-alert-queue cron job then delivers these to Slack within a minute. This is what makes webhook failures visible WITHOUT anyone manually querying webhook_dead_letters.';



CREATE OR REPLACE FUNCTION "public"."sweep_expire_lapsed_subscriptions"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Deactivate libraries whose subscription is ABOUT to be marked expired
  -- by this same sweep — done first, using the pre-update status, so we
  -- catch exactly the rows the UPDATE below is about to flip.
  UPDATE public.libraries l
  SET is_active = false
  FROM public.platform_subscriptions ps
  WHERE ps.library_id = l.id
    AND ps.status IN ('past_due', 'halted')
    AND ps.grace_period_ends_at IS NOT NULL
    AND ps.grace_period_ends_at < now()
    AND l.is_active = true;

  UPDATE public.platform_subscriptions
  SET status = 'expired'
  WHERE status IN ('past_due', 'halted')
    AND grace_period_ends_at IS NOT NULL
    AND grace_period_ends_at < now();
END;
$$;


ALTER FUNCTION "public"."sweep_expire_lapsed_subscriptions"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sweep_expire_lapsed_subscriptions"() IS 'Scheduled via pg_cron every 30 minutes. Marks lapsed (past_due/halted, past grace period) platform subscriptions as expired, AND deactivates the corresponding library (is_active=false) so it stops being publicly bookable and correctly shows as "Expired" rather than "Active" in the owner/admin UI. Fixed 2026-07 — previously only updated the subscription row, leaving libraries.is_active stale.';



CREATE OR REPLACE FUNCTION "public"."sweep_expire_stale_holds"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Fail the pending payment first (needs the booking_id link before the
  -- booking's own state changes), then cancel the booking itself.
  UPDATE public.payments p
  SET status = 'failed'
  FROM public.bookings b
  WHERE p.booking_id = b.id
    AND b.status = 'held'
    AND b.hold_expires_at IS NOT NULL
    AND b.hold_expires_at < now()
    AND p.status = 'pending';

  UPDATE public.bookings
  SET status = 'cancelled'
  WHERE status = 'held'
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at < now();
END;
$$;


ALTER FUNCTION "public"."sweep_expire_stale_holds"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sweep_expire_stale_holds"() IS 'Actively cancels held bookings whose hold_expires_at has passed with no completed payment, and fails their still-pending payment row. The seat itself is already immediately available to other students via the hold_expires_at filter in the availability query — this sweep is purely about keeping the bookings/payments tables from accumulating abandoned held rows indefinitely.';



CREATE OR REPLACE FUNCTION "public"."sweep_mark_eligible_started_checkins"() RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  UPDATE public.payments p
  SET escrow_status = 'eligible',
      escrow_eligible_at = now()
  WHERE p.status = 'paid'
    AND p.escrow_status = 'held'
    AND p.booking_id IN (
      SELECT id FROM public.bookings WHERE status = 'checked_in' AND start_time <= now()
    );
$$;


ALTER FUNCTION "public"."sweep_mark_eligible_started_checkins"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sweep_mark_eligible_started_checkins"() IS 'Catches the rare early-check-in case the AFTER UPDATE trigger could not: flips escrow eligible once start_time has actually passed for an already-checked-in, paid booking. Schedule on the same 5-minute cadence as sweep_complete_ended_bookings.';



CREATE OR REPLACE FUNCTION "public"."sweep_old_rate_limit_windows"() RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  DELETE FROM public.rate_limit_counters WHERE window_start < now() - interval '1 day';
$$;


ALTER FUNCTION "public"."sweep_old_rate_limit_windows"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_chat_conversation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    UPDATE "public"."chat_conversations"
    SET "updated_at" = "public"."now_ist"()
    WHERE "id" = NEW."conversation_id";
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_chat_conversation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trial_days_remaining"("lib_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT CASE
    WHEN l.trial_ends_at IS NULL THEN NULL
    ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (l.trial_ends_at - now())) / 86400.0)::integer)
  END
  FROM public.libraries l
  WHERE l.id = lib_id;
$$;


ALTER FUNCTION "public"."trial_days_remaining"("lib_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_lock_seat"("p_seat_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  return pg_try_advisory_xact_lock(hashtext(p_seat_id::text));
end;
$$;


ALTER FUNCTION "public"."try_lock_seat"("p_seat_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_actions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alert_log" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "severity" "public"."alert_severity" NOT NULL,
    "source" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "delivery_status" "public"."alert_delivery_status" DEFAULT 'pending'::"public"."alert_delivery_status" NOT NULL,
    "delivery_error" "text",
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "delivered_at" timestamp without time zone
);


ALTER TABLE "public"."alert_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."alert_log" IS 'Durable record of every alert-worthy event (payout failures, webhook processing failures, reversals). Written FIRST, then delivery (Slack via Upstash) is attempted — so even if the delivery channel is down, the alert itself is never lost, only its notification.';



CREATE TABLE IF NOT EXISTS "public"."amenities" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text"
);


ALTER TABLE "public"."amenities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."book_copies" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "book_id" "uuid",
    "status" "public"."book_status" DEFAULT 'available'::"public"."book_status"
);


ALTER TABLE "public"."book_copies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."book_issues" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "copy_id" "uuid",
    "issued_at" timestamp without time zone DEFAULT "public"."now_ist"(),
    "due_date" timestamp without time zone,
    "returned_at" timestamp without time zone,
    "guest_name" "text",
    "guest_phone" "text"
);


ALTER TABLE "public"."book_issues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."book_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "library_id" "uuid",
    "book_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "message" "text",
    "created_at" timestamp without time zone DEFAULT "public"."now_ist"(),
    "reviewed_at" timestamp without time zone,
    "reviewed_by" "uuid",
    CONSTRAINT "book_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."book_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "library_id" "uuid",
    "seat_id" "uuid",
    "start_time" timestamp without time zone,
    "end_time" timestamp without time zone,
    "status" "public"."booking_status",
    "hold_expires_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "guest_name" "text",
    "guest_phone" "text",
    "booking_mode" "text" DEFAULT 'online'::"text" NOT NULL,
    "booking_range" "tsrange" GENERATED ALWAYS AS ("tsrange"("start_time", "end_time", '[)'::"text")) STORED,
    "checked_in_at" timestamp without time zone,
    "subscription_id" "uuid",
    CONSTRAINT "bookings_booking_mode_check" CHECK (("booking_mode" = ANY (ARRAY['online'::"text", 'offline'::"text"])))
);

ALTER TABLE ONLY "public"."bookings" REPLICA IDENTITY FULL;


ALTER TABLE "public"."bookings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."bookings"."subscription_id" IS 'Set when this booking was covered by an active membership subscription instead of a per-booking payment. The matching payments row still exists (amount=0, base_amount=0) so payments remains the single source of truth for "was this booking paid for and how" — see create_subscription_covered_booking().';



CREATE TABLE IF NOT EXISTS "public"."books" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "library_id" "uuid",
    "title" "text",
    "author" "text",
    "isbn" "text"
);


ALTER TABLE "public"."books" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "guest_session_id" "text",
    "owner_type" "public"."chat_owner_type" DEFAULT 'user'::"public"."chat_owner_type" NOT NULL,
    "title" "text",
    "context_snapshot" "jsonb",
    "created_at" timestamp without time zone DEFAULT "public"."now_ist"(),
    "updated_at" timestamp without time zone DEFAULT "public"."now_ist"(),
    "archived_at" timestamp without time zone,
    CONSTRAINT "chat_conversations_owner_chk" CHECK (((("owner_type" = 'user'::"public"."chat_owner_type") AND ("user_id" IS NOT NULL) AND ("guest_session_id" IS NULL)) OR (("owner_type" = 'guest'::"public"."chat_owner_type") AND ("user_id" IS NULL) AND ("guest_session_id" IS NOT NULL))))
);


ALTER TABLE "public"."chat_conversations" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_conversations" IS 'AI assistant conversation threads. One row per thread; guest threads (owner_type=guest) exist only after being migrated in from localStorage at login.';



CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "role" "public"."chat_role" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "tool_name" "text",
    "tool_args" "jsonb",
    "tool_result" "jsonb",
    "model" "text",
    "created_at" timestamp without time zone DEFAULT "public"."now_ist"()
);

ALTER TABLE ONLY "public"."chat_messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_messages" IS 'AI assistant messages, including tool call/result rows (role=tool), one row per turn.';



CREATE TABLE IF NOT EXISTS "public"."coupon_redemptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coupon_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "discount_amount" numeric NOT NULL,
    "redeemed_at" timestamp without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coupon_redemptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."coupon_redemptions" IS 'One row per successful coupon use. discount_amount is the actual rupee amount discounted (already resolved from percent/flat at redemption time), independent of the coupon''s current discount_value in case that changes later. Written only by create_pending_subscription_with_payment() — never directly by client code.';



CREATE TABLE IF NOT EXISTS "public"."coupons" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "plan_id" "uuid",
    "discount_type" "text" NOT NULL,
    "discount_value" numeric NOT NULL,
    "max_redemptions" integer,
    "max_redemptions_per_user" integer DEFAULT 1 NOT NULL,
    "times_redeemed" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "expires_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coupons_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percent'::"text", 'flat'::"text"]))),
    CONSTRAINT "coupons_discount_value_positive" CHECK (("discount_value" > (0)::numeric)),
    CONSTRAINT "coupons_max_per_user_positive" CHECK (("max_redemptions_per_user" > 0)),
    CONSTRAINT "coupons_max_redemptions_positive" CHECK ((("max_redemptions" IS NULL) OR ("max_redemptions" > 0))),
    CONSTRAINT "coupons_percent_range" CHECK ((("discount_type" <> 'percent'::"text") OR (("discount_value" > (0)::numeric) AND ("discount_value" <= (100)::numeric))))
);


ALTER TABLE "public"."coupons" OWNER TO "postgres";


COMMENT ON TABLE "public"."coupons" IS 'Owner-created discount codes for their own subscription plans, shared manually (WhatsApp/email) with students. code is unique per owner_id, not globally. plan_id NULL = valid for any of this owner''s plans. Redemption safety (limits, expiry, per-user cap) is enforced inside create_pending_subscription_with_payment(), not by the client, so a modified client can never bypass the discount rules.';



CREATE OR REPLACE VIEW "public"."daily_booking_trend" AS
 SELECT "day",
    "bookings_count",
    "completed_count",
    "cancelled_count",
    "no_show_count"
   FROM ( SELECT ("d"."d")::"date" AS "day",
            "count"("b"."id") AS "bookings_count",
            "count"("b"."id") FILTER (WHERE ("b"."status" = ANY (ARRAY['completed'::"public"."booking_status", 'checked_in'::"public"."booking_status"]))) AS "completed_count",
            "count"("b"."id") FILTER (WHERE ("b"."status" = 'cancelled'::"public"."booking_status")) AS "cancelled_count",
            "count"("b"."id") FILTER (WHERE ("b"."status" = 'no_show'::"public"."booking_status")) AS "no_show_count"
           FROM ("generate_series"((CURRENT_DATE - '89 days'::interval), (CURRENT_DATE)::timestamp without time zone, '1 day'::interval) "d"("d")
             LEFT JOIN "public"."bookings" "b" ON ((("b"."created_at")::"date" = ("d"."d")::"date")))
          GROUP BY "d"."d") "sub"
  WHERE "public"."is_admin"()
  ORDER BY "day";


ALTER VIEW "public"."daily_booking_trend" OWNER TO "postgres";


COMMENT ON VIEW "public"."daily_booking_trend" IS 'Booking volume per day for the last 90 days, zero-filled for days with no bookings. Admin-only.';



CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "booking_id" "uuid",
    "amount" numeric,
    "status" "public"."payment_status",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "razorpay_order_id" "text",
    "razorpay_payment_id" "text",
    "subscription_id" "uuid",
    "escrow_status" "public"."escrow_status" DEFAULT 'not_applicable'::"public"."escrow_status" NOT NULL,
    "platform_commission_amount" numeric,
    "owner_payout_amount" numeric,
    "escrow_eligible_at" timestamp without time zone,
    "commission_rate_bps" integer DEFAULT 700 NOT NULL,
    "base_amount" numeric,
    "payment_mode" "text",
    "payment_note" "text",
    CONSTRAINT "payments_payment_mode_check" CHECK ((("payment_mode" IS NULL) OR ("payment_mode" = ANY (ARRAY['cash'::"text", 'upi'::"text", 'other'::"text"]))))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payments"."commission_rate_bps" IS 'Platform commission in basis points at time of payment (700 = 7%, changed from 500=5% in 2026-07). Stored per-payment (not looked up live) so historical payouts remain correct even if the platform rate changes later.';



COMMENT ON COLUMN "public"."payments"."base_amount" IS 'The library''s listed price (= owner''s payout amount) BEFORE the platform fee is added on top. Set at booking-creation time by the app for online student bookings. NULL for payments where the fee-on-top model does not apply (manual/walk-in bookings, subscriptions) — those use `amount` directly, in full, as the owner''s revenue. NULL is also the legacy state for payments created before this migration; confirm_booking_payment_captured/confirm_booking_extension_captured fall back to commission-deducted math in that case.';



COMMENT ON COLUMN "public"."payments"."payment_mode" IS 'How a manual walk-in payment was collected (cash/upi/other). Null for online Razorpay payments.';



COMMENT ON COLUMN "public"."payments"."payment_note" IS 'Free-form note entered by owner/staff for a manual walk-in payment. Null for online Razorpay payments.';



CREATE TABLE IF NOT EXISTS "public"."platform_subscription_payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "platform_subscription_id" "uuid" NOT NULL,
    "library_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "status" "public"."platform_payment_status" DEFAULT 'created'::"public"."platform_payment_status" NOT NULL,
    "amount_paise" integer NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "razorpay_payment_id" "text",
    "razorpay_invoice_id" "text",
    "billing_period_start" timestamp without time zone,
    "billing_period_end" timestamp without time zone,
    "is_retry" boolean DEFAULT false NOT NULL,
    "retry_attempt" integer DEFAULT 0 NOT NULL,
    "failure_reason" "text",
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_subscription_payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."platform_subscription_payments" IS 'Ledger of every platform-subscription billing attempt (success or failure) for a library, driven by Razorpay subscription.* webhooks.';



CREATE OR REPLACE VIEW "public"."daily_revenue_trend" AS
 SELECT "day",
    "gmv",
    "commission_revenue",
    "subscription_revenue"
   FROM ( SELECT ("d"."d")::"date" AS "day",
            COALESCE(( SELECT "sum"("p"."amount") AS "sum"
                   FROM "public"."payments" "p"
                  WHERE (("p"."booking_id" IS NOT NULL) AND ("p"."status" = ANY (ARRAY['paid'::"public"."payment_status", 'partially_refunded'::"public"."payment_status"])) AND (("p"."created_at")::"date" = ("d"."d")::"date"))), (0)::numeric) AS "gmv",
            COALESCE(( SELECT "sum"("p"."platform_commission_amount") AS "sum"
                   FROM "public"."payments" "p"
                  WHERE (("p"."booking_id" IS NOT NULL) AND ("p"."status" = ANY (ARRAY['paid'::"public"."payment_status", 'partially_refunded'::"public"."payment_status"])) AND (("p"."created_at")::"date" = ("d"."d")::"date"))), (0)::numeric) AS "commission_revenue",
            COALESCE(( SELECT (("sum"("sp"."amount_paise"))::numeric / 100.0)
                   FROM "public"."platform_subscription_payments" "sp"
                  WHERE (("sp"."status" = 'captured'::"public"."platform_payment_status") AND (("sp"."created_at")::"date" = ("d"."d")::"date"))), (0)::numeric) AS "subscription_revenue"
           FROM "generate_series"((CURRENT_DATE - '89 days'::interval), (CURRENT_DATE)::timestamp without time zone, '1 day'::interval) "d"("d")) "sub"
  WHERE "public"."is_admin"()
  ORDER BY "day";


ALTER VIEW "public"."daily_revenue_trend" OWNER TO "postgres";


COMMENT ON VIEW "public"."daily_revenue_trend" IS 'Daily GMV, booking-commission revenue, and subscription revenue for the last 90 days. Platform revenue per day = commission_revenue + subscription_revenue. Admin-only.';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "phone" "text",
    "email" "text",
    "name" "text",
    "role" "public"."user_role" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "full_name" "text",
    "city" "text",
    "state" "text",
    "onboarded" boolean DEFAULT false,
    "payout_vpa" "text",
    "payout_bank_account_number" "text",
    "payout_bank_ifsc" "text",
    "payout_bank_account_name" "text",
    "payout_default_method" "public"."payout_destination_type",
    "razorpay_contact_id" "text",
    "razorpay_fund_account_id_bank" "text",
    "razorpay_fund_account_id_vpa" "text",
    "role_selected_at" timestamp with time zone,
    "whatsapp_number" "text",
    "whatsapp_verified_at" timestamp with time zone,
    CONSTRAINT "users_whatsapp_number_e164" CHECK ((("whatsapp_number" IS NULL) OR ("whatsapp_number" ~ '^\+[1-9]\d{7,14}$'::"text")))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."payout_default_method" IS 'Which payout destination to use when sweeping eligible escrow for this owner: bank_account or vpa. NULL means owner has not finished payout setup yet — payouts will be skipped and flagged for admin.';



COMMENT ON COLUMN "public"."users"."role_selected_at" IS 'Set exactly once, when the user explicitly chooses a role in /onboarding/role. NULL means "never chosen" -- distinct from `role`, which is never NULL because handle_new_user() gives every new signup a student placeholder.';



COMMENT ON COLUMN "public"."users"."whatsapp_number" IS 'E.164 WhatsApp contact number collected during onboarding (mandatory for all roles). Not a login credential. Unique across the platform -- see users_whatsapp_number_unique.';



COMMENT ON COLUMN "public"."users"."whatsapp_verified_at" IS 'Set once the OTP sent to whatsapp_number is confirmed via verifyWhatsappOtp(). users.onboarded cannot become true without this.';



CREATE OR REPLACE VIEW "public"."daily_user_growth" AS
 SELECT "day",
    "new_students",
    "new_owners",
    "new_staff"
   FROM ( SELECT ("d"."d")::"date" AS "day",
            "count"("u"."id") FILTER (WHERE ("u"."role" = 'student'::"public"."user_role")) AS "new_students",
            "count"("u"."id") FILTER (WHERE ("u"."role" = 'owner'::"public"."user_role")) AS "new_owners",
            "count"("u"."id") FILTER (WHERE ("u"."role" = 'staff'::"public"."user_role")) AS "new_staff"
           FROM ("generate_series"((CURRENT_DATE - '89 days'::interval), (CURRENT_DATE)::timestamp without time zone, '1 day'::interval) "d"("d")
             LEFT JOIN "public"."users" "u" ON ((("u"."created_at")::"date" = ("d"."d")::"date")))
          GROUP BY "d"."d") "sub"
  WHERE "public"."is_admin"()
  ORDER BY "day";


ALTER VIEW "public"."daily_user_growth" OWNER TO "postgres";


COMMENT ON VIEW "public"."daily_user_growth" IS 'New user signups per day by role for the last 90 days. Admin-only.';



CREATE TABLE IF NOT EXISTS "public"."financial_audit_log" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "event" "text" NOT NULL,
    "amount" numeric,
    "previous_state" "jsonb",
    "new_state" "jsonb",
    "actor_type" "text" DEFAULT 'system'::"text" NOT NULL,
    "actor_id" "uuid",
    "webhook_event_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."financial_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."financial_audit_log" IS 'Append-only audit trail for every money-bearing state transition. Never updated or deleted — corrections are new rows, not edits. This is the source of truth for reconciliation against Razorpay''s own records.';



CREATE TABLE IF NOT EXISTS "public"."libraries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "owner_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "city" "text",
    "area" "text",
    "address" "text",
    "latitude" numeric,
    "longitude" numeric,
    "rating" numeric DEFAULT 0,
    "total_reviews" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "state" "text",
    "approval_status" "public"."library_approval_status" DEFAULT 'pending'::"public"."library_approval_status" NOT NULL,
    "approval_notes" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp without time zone,
    "submitted_for_review_at" timestamp without time zone,
    "suspended_reason" "text",
    "suspended_at" timestamp without time zone,
    "suspended_by" "uuid",
    "geo_point" "public"."geography"(Point,4326) GENERATED ALWAYS AS (
CASE
    WHEN (("latitude" IS NOT NULL) AND ("longitude" IS NOT NULL)) THEN ("public"."st_setsrid"("public"."st_makepoint"(("longitude")::double precision, ("latitude")::double precision), 4326))::"public"."geography"
    ELSE NULL::"public"."geography"
END) STORED,
    "trial_ends_at" timestamp with time zone
);


ALTER TABLE "public"."libraries" OWNER TO "postgres";


COMMENT ON COLUMN "public"."libraries"."approval_status" IS 'Platform admin review gate. A library is only publicly visible when approval_status = approved AND is_active = true AND it has an active platform subscription (see has_active_platform_subscription()).';



COMMENT ON COLUMN "public"."libraries"."geo_point" IS 'Generated PostGIS geography point from lat/lng. Indexed with GiST for ST_DWithin radius filter and KNN (<->) ordering in search_libraries_by_distance().';



COMMENT ON COLUMN "public"."libraries"."trial_ends_at" IS 'Set once, at creation, ONLY for an owner''s first library ever created (see createLibrary() in lib/actions/library.ts) -- 14 days from creation. NULL for every subsequent library from the same owner, which must have an active platform_subscriptions row to go live at all. Read by has_active_platform_subscription() as an alternate "is this library allowed to be active" condition alongside a real paid subscription; sweep_deactivate_expired_trials() relies on that same function to know when to take a lapsed trial offline.';



CREATE TABLE IF NOT EXISTS "public"."library_amenities" (
    "library_id" "uuid" NOT NULL,
    "amenity_id" "uuid" NOT NULL
);


ALTER TABLE "public"."library_amenities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."library_images" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "library_id" "uuid",
    "image_url" "text",
    "is_cover" boolean DEFAULT false,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "deleted" boolean DEFAULT false
);


ALTER TABLE "public"."library_images" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."monthly_platform_trend" AS
 SELECT "month_start",
    "bookings_count",
    "gmv"
   FROM ( SELECT ("date_trunc"('month'::"text", "d"."d"))::"date" AS "month_start",
            "count"("b"."id") AS "bookings_count",
            COALESCE("sum"("p"."amount") FILTER (WHERE ("p"."status" = ANY (ARRAY['paid'::"public"."payment_status", 'partially_refunded'::"public"."payment_status"]))), (0)::numeric) AS "gmv"
           FROM (("generate_series"((CURRENT_DATE - '365 days'::interval), (CURRENT_DATE)::timestamp without time zone, '1 day'::interval) "d"("d")
             LEFT JOIN "public"."bookings" "b" ON ((("b"."created_at")::"date" = ("d"."d")::"date")))
             LEFT JOIN "public"."payments" "p" ON (("p"."booking_id" = "b"."id")))
          GROUP BY ("date_trunc"('month'::"text", "d"."d"))) "sub"
  WHERE "public"."is_admin"()
  ORDER BY "month_start";


ALTER VIEW "public"."monthly_platform_trend" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "channel" "public"."notification_channel",
    "event" "text",
    "payload" "jsonb",
    "status" "public"."notification_status",
    "created_at" timestamp without time zone DEFAULT "public"."now_ist"(),
    "title" "text",
    "body" "text",
    "read_at" timestamp without time zone,
    "library_id" "uuid",
    "booking_id" "uuid",
    "subscription_id" "uuid"
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."notifications"."subscription_id" IS 'Which membership-plan subscription this notification is about, if any -- mirrors booking_id/library_id. Used by the whatsapp-reminders cron to avoid re-sending a "subscription expiring soon" reminder on every run.';



CREATE TABLE IF NOT EXISTS "public"."payout_clawbacks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "refund_id" "uuid",
    "original_payout_id" "uuid",
    "amount_owed" numeric NOT NULL,
    "amount_recovered" numeric DEFAULT 0 NOT NULL,
    "status" "public"."clawback_status" DEFAULT 'pending'::"public"."clawback_status" NOT NULL,
    "notes" "text",
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payout_clawbacks" OWNER TO "postgres";


COMMENT ON TABLE "public"."payout_clawbacks" IS 'Tracks money owed back to the platform when a refund is issued for a booking whose payout has already settled to the owner. Recovered by deducting from the owner''s NEXT eligible payout(s) via the payout sweep (see run-payouts route), not by attempting to reverse the original RazorpayX payout, which is not supported by the provider.';



COMMENT ON COLUMN "public"."payout_clawbacks"."refund_id" IS 'NULL when this clawback was created because a payout REVERSED (money never reached the owner, nothing to claw back from them — instead this signals the booking payout needs to be re-attempted, tracked via original_payout_id). Set when created from a student refund on an already-settled payout (the normal clawback case).';



CREATE TABLE IF NOT EXISTS "public"."payouts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "library_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "status" "public"."payout_status" DEFAULT 'pending'::"public"."payout_status" NOT NULL,
    "gross_amount_paise" integer NOT NULL,
    "commission_paise" integer NOT NULL,
    "net_amount_paise" integer NOT NULL,
    "destination_type" "public"."payout_destination_type",
    "destination_snapshot" "jsonb",
    "razorpay_payout_id" "text",
    "razorpay_fund_account_id" "text",
    "utr" "text",
    "failure_reason" "text",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "processed_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "text",
    "clawback_deducted_paise" integer DEFAULT 0 NOT NULL,
    "reversed_at" timestamp without time zone,
    "reversal_reason" "text",
    "last_webhook_event_id" "uuid"
);


ALTER TABLE "public"."payouts" OWNER TO "postgres";


COMMENT ON TABLE "public"."payouts" IS 'One row per booking payment payout to an owner via RazorpayX. Created by the daily escrow sweep once a payments row reaches escrow_status=eligible.';



COMMENT ON COLUMN "public"."payouts"."clawback_deducted_paise" IS 'Amount deducted from this payout to recover a pending clawback from a prior refund on an already-settled booking for this owner. net_amount_paise already reflects this deduction; this column exists purely for admin-facing transparency.';



COMMENT ON COLUMN "public"."payouts"."reversed_at" IS 'Set when a payout.reversed webhook is received. Per Razorpay docs, a payout already in "processed" state can still move to "reversed" within T+3 working days in rare cases (beneficiary bank later rejects the credit) — this is NOT assumed impossible just because status was previously completed.';



CREATE OR REPLACE VIEW "public"."pending_no_show_escrow" AS
 SELECT "b"."id" AS "booking_id",
    "b"."library_id",
    "l"."name" AS "library_name",
    "l"."owner_id",
    "b"."user_id" AS "student_id",
    "b"."start_time",
    "b"."end_time",
    "p"."id" AS "payment_id",
    "p"."amount",
    "p"."escrow_status"
   FROM (("public"."bookings" "b"
     JOIN "public"."libraries" "l" ON (("l"."id" = "b"."library_id")))
     JOIN "public"."payments" "p" ON (("p"."booking_id" = "b"."id")))
  WHERE (("b"."status" = 'no_show'::"public"."booking_status") AND ("p"."status" = 'paid'::"public"."payment_status") AND ("p"."escrow_status" = 'held'::"public"."escrow_status"));


ALTER VIEW "public"."pending_no_show_escrow" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_libraries" (
    "plan_id" "uuid" NOT NULL,
    "library_id" "uuid" NOT NULL
);


ALTER TABLE "public"."plan_libraries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "owner_id" "uuid",
    "name" "text",
    "price" numeric,
    "duration_days" integer,
    "session_limit" "text",
    "scope" "public"."plan_scope",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "time_window_start" time without time zone,
    "time_window_end" time without time zone,
    "days_of_week" smallint[],
    CONSTRAINT "plans_days_of_week_valid" CHECK ((("days_of_week" IS NULL) OR ((("array_length"("days_of_week", 1) >= 1) AND ("array_length"("days_of_week", 1) <= 7)) AND ("days_of_week" <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint])))),
    CONSTRAINT "plans_session_limit_numeric" CHECK ((("session_limit" IS NULL) OR ("session_limit" ~ '^[0-9]+$'::"text"))),
    CONSTRAINT "plans_time_window_consistent" CHECK (((("time_window_start" IS NULL) AND ("time_window_end" IS NULL)) OR (("time_window_start" IS NOT NULL) AND ("time_window_end" IS NOT NULL) AND ("time_window_start" < "time_window_end"))))
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


COMMENT ON COLUMN "public"."plans"."time_window_start" IS 'Optional. If set (together with time_window_end), a booking made using a subscription to this plan must start AND end within [time_window_start, time_window_end] every day -- e.g. a "9 to 12" morning-only plan. NULL (the default) means no time restriction. Enforced in create_subscription_covered_booking(), not just in the client.';



COMMENT ON COLUMN "public"."plans"."time_window_end" IS 'See time_window_start.';



COMMENT ON COLUMN "public"."plans"."days_of_week" IS 'Optional. If set, a booking made using a subscription to this plan is only allowed on these days (0=Sunday .. 6=Saturday, matching Postgres EXTRACT(DOW FROM ...)). NULL (the default) means every day. Composes with time_window_start/end -- a plan can restrict by day, by time, both, or neither. Enforced in create_subscription_covered_booking().';



CREATE TABLE IF NOT EXISTS "public"."platform_subscriptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "library_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "status" "public"."platform_subscription_status" DEFAULT 'created'::"public"."platform_subscription_status" NOT NULL,
    "razorpay_plan_id" "text",
    "razorpay_customer_id" "text",
    "razorpay_subscription_id" "text",
    "amount_paise" integer DEFAULT 39900 NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "current_period_start" timestamp without time zone,
    "current_period_end" timestamp without time zone,
    "next_billing_at" timestamp without time zone,
    "grace_period_ends_at" timestamp without time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "cancelled_at" timestamp without time zone,
    "cancellation_reason" "text",
    "failed_charge_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."platform_subscriptions" IS 'One row per library: the library''s own ₹500/mo platform billing subscription via Razorpay Subscriptions (UPI AutoPay mandate). Not to be confused with public.subscriptions, which is a STUDENT''s membership plan with a library.';



CREATE TABLE IF NOT EXISTS "public"."refunds" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "student_id" "uuid",
    "library_id" "uuid",
    "owner_id" "uuid",
    "initiated_by" "uuid",
    "resolved_by" "uuid",
    "refund_type" "public"."refund_type" NOT NULL,
    "status" "public"."refund_status" DEFAULT 'pending'::"public"."refund_status" NOT NULL,
    "amount" numeric NOT NULL,
    "reason" "text" NOT NULL,
    "admin_notes" "text",
    "razorpay_refund_id" "text",
    "failure_reason" "text",
    "payout_already_settled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp without time zone,
    "idempotency_key" "text"
);


ALTER TABLE "public"."refunds" OWNER TO "postgres";


COMMENT ON TABLE "public"."refunds" IS 'Admin-initiated full/partial refunds against a booking payment. One payment may have multiple partial refunds, but their amounts may never sum to more than the original payment amount (enforced in application logic at refund-creation time, not by a DB constraint, since concurrent partials are rare and admin-gated).';



CREATE OR REPLACE VIEW "public"."platform_overview" AS
 SELECT "total_libraries",
    "active_libraries",
    "pending_approvals",
    "suspended_libraries",
    "total_students",
    "total_owners",
    "total_staff",
    "total_gmv",
    "total_booking_commission_revenue",
    "total_subscription_revenue",
    "active_subscriptions",
    "past_due_subscriptions",
    "bookings_today",
    "bookings_last_7d",
    "bookings_last_30d",
    "pending_refunds",
    "refunded_last_30d",
    "total_owner_payouts"
   FROM ( SELECT ( SELECT "count"(*) AS "count"
                   FROM "public"."libraries") AS "total_libraries",
            ( SELECT "count"(*) AS "count"
                   FROM "public"."libraries"
                  WHERE (("libraries"."approval_status" = 'approved'::"public"."library_approval_status") AND ("libraries"."is_active" = true))) AS "active_libraries",
            ( SELECT "count"(*) AS "count"
                   FROM "public"."libraries"
                  WHERE ("libraries"."approval_status" = 'pending'::"public"."library_approval_status")) AS "pending_approvals",
            ( SELECT "count"(*) AS "count"
                   FROM "public"."libraries"
                  WHERE ("libraries"."approval_status" = 'suspended'::"public"."library_approval_status")) AS "suspended_libraries",
            ( SELECT "count"(*) AS "count"
                   FROM "public"."users"
                  WHERE ("users"."role" = 'student'::"public"."user_role")) AS "total_students",
            ( SELECT "count"(*) AS "count"
                   FROM "public"."users"
                  WHERE ("users"."role" = 'owner'::"public"."user_role")) AS "total_owners",
            ( SELECT "count"(*) AS "count"
                   FROM "public"."users"
                  WHERE ("users"."role" = 'staff'::"public"."user_role")) AS "total_staff",
            ( SELECT COALESCE("sum"("payments"."amount"), (0)::numeric) AS "coalesce"
                   FROM "public"."payments"
                  WHERE (("payments"."booking_id" IS NOT NULL) AND ("payments"."status" = ANY (ARRAY['paid'::"public"."payment_status", 'partially_refunded'::"public"."payment_status"])))) AS "total_gmv",
            ( SELECT COALESCE("sum"("payments"."platform_commission_amount"), (0)::numeric) AS "coalesce"
                   FROM "public"."payments"
                  WHERE (("payments"."booking_id" IS NOT NULL) AND ("payments"."status" = ANY (ARRAY['paid'::"public"."payment_status", 'partially_refunded'::"public"."payment_status"])))) AS "total_booking_commission_revenue",
            ( SELECT ((COALESCE("sum"("platform_subscription_payments"."amount_paise"), (0)::bigint))::numeric / 100.0)
                   FROM "public"."platform_subscription_payments"
                  WHERE ("platform_subscription_payments"."status" = 'captured'::"public"."platform_payment_status")) AS "total_subscription_revenue",
            ( SELECT "count"(*) AS "count"
                   FROM "public"."platform_subscriptions"
                  WHERE ("platform_subscriptions"."status" = 'active'::"public"."platform_subscription_status")) AS "active_subscriptions",
            ( SELECT "count"(*) AS "count"
                   FROM "public"."platform_subscriptions"
                  WHERE ("platform_subscriptions"."status" = 'past_due'::"public"."platform_subscription_status")) AS "past_due_subscriptions",
            ( SELECT "count"(*) AS "count"
                   FROM "public"."bookings"
                  WHERE (("bookings"."created_at")::"date" = CURRENT_DATE)) AS "bookings_today",
            ( SELECT "count"(*) AS "count"
                   FROM "public"."bookings"
                  WHERE ("bookings"."created_at" >= (CURRENT_DATE - '7 days'::interval))) AS "bookings_last_7d",
            ( SELECT "count"(*) AS "count"
                   FROM "public"."bookings"
                  WHERE ("bookings"."created_at" >= (CURRENT_DATE - '30 days'::interval))) AS "bookings_last_30d",
            ( SELECT "count"(*) AS "count"
                   FROM "public"."refunds"
                  WHERE ("refunds"."status" = 'pending'::"public"."refund_status")) AS "pending_refunds",
            ( SELECT COALESCE("sum"("refunds"."amount"), (0)::numeric) AS "coalesce"
                   FROM "public"."refunds"
                  WHERE (("refunds"."status" = 'completed'::"public"."refund_status") AND ("refunds"."created_at" >= (CURRENT_DATE - '30 days'::interval)))) AS "refunded_last_30d",
            ( SELECT COALESCE("sum"(COALESCE("payments"."owner_payout_amount", "payments"."amount")), (0)::numeric) AS "coalesce"
                   FROM "public"."payments"
                  WHERE (("payments"."booking_id" IS NOT NULL) AND ("payments"."status" = ANY (ARRAY['paid'::"public"."payment_status", 'partially_refunded'::"public"."payment_status"])))) AS "total_owner_payouts") "sub"
  WHERE "public"."is_admin"();


ALTER VIEW "public"."platform_overview" OWNER TO "postgres";


COMMENT ON VIEW "public"."platform_overview" IS 'Single-row platform-wide snapshot for the admin dashboard headline metrics. "Platform revenue" = total_booking_commission_revenue + total_subscription_revenue. total_gmv is gross booking volume (what students paid). total_owner_payouts is what owners actually receive/received. Admin-only: returns zero rows for non-admins.';



CREATE TABLE IF NOT EXISTS "public"."rate_limit_counters" (
    "key" "text" NOT NULL,
    "window_start" timestamp without time zone NOT NULL,
    "count" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."rate_limit_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seats" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "library_id" "uuid",
    "row_label" "text",
    "column_number" integer,
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."seats" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."settlement_summary" AS
 SELECT "l"."id" AS "library_id",
    "l"."name" AS "library_name",
    "l"."owner_id",
    "date_trunc"('day'::"text", "p"."created_at") AS "settlement_date",
    "count"(*) FILTER (WHERE ("p"."escrow_status" = 'held'::"public"."escrow_status")) AS "bookings_held",
    "count"(*) FILTER (WHERE ("p"."escrow_status" = 'eligible'::"public"."escrow_status")) AS "bookings_eligible",
    "count"(*) FILTER (WHERE ("p"."escrow_status" = 'paid_out'::"public"."escrow_status")) AS "bookings_paid_out",
    COALESCE("sum"("p"."amount") FILTER (WHERE ("p"."escrow_status" = 'paid_out'::"public"."escrow_status")), (0)::numeric) AS "gross_settled",
    COALESCE("sum"("p"."platform_commission_amount") FILTER (WHERE ("p"."escrow_status" = 'paid_out'::"public"."escrow_status")), (0)::numeric) AS "commission_settled",
    COALESCE("sum"("p"."owner_payout_amount") FILTER (WHERE ("p"."escrow_status" = 'paid_out'::"public"."escrow_status")), (0)::numeric) AS "net_settled"
   FROM (("public"."payments" "p"
     JOIN "public"."bookings" "b" ON (("b"."id" = "p"."booking_id")))
     JOIN "public"."libraries" "l" ON (("l"."id" = "b"."library_id")))
  WHERE ("p"."booking_id" IS NOT NULL)
  GROUP BY "l"."id", "l"."name", "l"."owner_id", ("date_trunc"('day'::"text", "p"."created_at"));


ALTER VIEW "public"."settlement_summary" OWNER TO "postgres";


COMMENT ON VIEW "public"."settlement_summary" IS 'Per-library, per-day rollup of escrow/payout state for admin settlement reports. All money columns are in rupees (numeric), matching payments.amount convention.';



CREATE TABLE IF NOT EXISTS "public"."slot_configs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "library_id" "uuid" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "days" smallint[] NOT NULL,
    "price" numeric DEFAULT 0 NOT NULL,
    "discount" numeric DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "slot_configs_days_check" CHECK ((("days" <> '{}'::smallint[]) AND ("days" <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint]))),
    CONSTRAINT "slot_configs_discount_check" CHECK ((("discount" >= (0)::numeric) AND ("discount" <= "price"))),
    CONSTRAINT "slot_configs_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "slot_configs_time_check" CHECK (("start_time" < "end_time"))
);


ALTER TABLE "public"."slot_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "library_id" "uuid",
    "role" "text",
    CONSTRAINT "staff_role_check" CHECK (("role" = ANY (ARRAY['staff'::"text", 'senior_staff'::"text"])))
);


ALTER TABLE "public"."staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "library_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "message" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "reviewed_at" timestamp without time zone,
    CONSTRAINT "staff_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."staff_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "plan_id" "uuid",
    "start_date" timestamp without time zone,
    "end_date" timestamp without time zone,
    "status" "public"."subscription_status",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "provider" "text" NOT NULL,
    "external_event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "status" "public"."webhook_processing_status" DEFAULT 'received'::"public"."webhook_processing_status" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "error_message" "text",
    "retry_count" integer DEFAULT 0 NOT NULL,
    "received_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp without time zone
);


ALTER TABLE "public"."webhook_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."webhook_events" IS 'Idempotency ledger for every inbound webhook delivery. The UNIQUE(provider, external_event_id) constraint is the real dedup gate — a duplicate delivery fails this INSERT with 23505 and the handler short-circuits without re-running side effects. Also doubles as a dead-letter inspection point: status=failed rows with their error_message are what to triage first after an incident.';



CREATE OR REPLACE VIEW "public"."webhook_dead_letters" AS
 SELECT "id",
    "provider",
    "external_event_id",
    "event_type",
    "error_message",
    "retry_count",
    "received_at",
    "processed_at"
   FROM "public"."webhook_events"
  WHERE (("status" = 'failed'::"public"."webhook_processing_status") OR (("status" = 'processing'::"public"."webhook_processing_status") AND ("received_at" < ("now"() - '00:10:00'::interval))))
  ORDER BY "received_at" DESC;


ALTER VIEW "public"."webhook_dead_letters" OWNER TO "postgres";


COMMENT ON VIEW "public"."webhook_dead_letters" IS 'Webhooks that genuinely failed (status=failed) or appear stuck mid-processing (status=processing for over 10 minutes, indicating a crashed handler). Admin-facing triage list.';



CREATE OR REPLACE VIEW "public"."weekly_platform_trend" AS
 SELECT "week_start",
    "bookings_count",
    "gmv"
   FROM ( SELECT ("date_trunc"('week'::"text", "d"."d"))::"date" AS "week_start",
            "count"("b"."id") AS "bookings_count",
            COALESCE("sum"("p"."amount") FILTER (WHERE ("p"."status" = ANY (ARRAY['paid'::"public"."payment_status", 'partially_refunded'::"public"."payment_status"]))), (0)::numeric) AS "gmv"
           FROM (("generate_series"((CURRENT_DATE - '111 days'::interval), (CURRENT_DATE)::timestamp without time zone, '1 day'::interval) "d"("d")
             LEFT JOIN "public"."bookings" "b" ON ((("b"."created_at")::"date" = ("d"."d")::"date")))
             LEFT JOIN "public"."payments" "p" ON (("p"."booking_id" = "b"."id")))
          GROUP BY ("date_trunc"('week'::"text", "d"."d"))) "sub"
  WHERE "public"."is_admin"()
  ORDER BY "week_start";


ALTER VIEW "public"."weekly_platform_trend" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_otp_codes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "whatsapp_number" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."whatsapp_otp_codes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_actions"
    ADD CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alert_log"
    ADD CONSTRAINT "alert_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."amenities"
    ADD CONSTRAINT "amenities_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."amenities"
    ADD CONSTRAINT "amenities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."book_copies"
    ADD CONSTRAINT "book_copies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."book_issues"
    ADD CONSTRAINT "book_issues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."book_requests"
    ADD CONSTRAINT "book_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."books"
    ADD CONSTRAINT "books_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_conversations"
    ADD CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_owner_code_unique" UNIQUE ("owner_id", "code");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_audit_log"
    ADD CONSTRAINT "financial_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."libraries"
    ADD CONSTRAINT "libraries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."library_amenities"
    ADD CONSTRAINT "library_amenities_pkey" PRIMARY KEY ("library_id", "amenity_id");



ALTER TABLE ONLY "public"."library_images"
    ADD CONSTRAINT "library_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "no_overlapping_bookings" EXCLUDE USING "gist" ("seat_id" WITH =, "booking_range" WITH &&) WHERE (("status" = ANY (ARRAY['confirmed'::"public"."booking_status", 'checked_in'::"public"."booking_status", 'held'::"public"."booking_status"])));



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payout_clawbacks"
    ADD CONSTRAINT "payout_clawbacks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_payment_id_unique" UNIQUE ("payment_id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_razorpay_payout_id_key" UNIQUE ("razorpay_payout_id");



ALTER TABLE ONLY "public"."plan_libraries"
    ADD CONSTRAINT "plan_libraries_pkey" PRIMARY KEY ("plan_id", "library_id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_subscription_payments"
    ADD CONSTRAINT "platform_subscription_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_subscriptions"
    ADD CONSTRAINT "platform_subscriptions_library_id_key" UNIQUE ("library_id");



ALTER TABLE ONLY "public"."platform_subscriptions"
    ADD CONSTRAINT "platform_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_subscriptions"
    ADD CONSTRAINT "platform_subscriptions_razorpay_subscription_id_key" UNIQUE ("razorpay_subscription_id");



ALTER TABLE ONLY "public"."rate_limit_counters"
    ADD CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key", "window_start");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_razorpay_refund_id_key" UNIQUE ("razorpay_refund_id");



ALTER TABLE ONLY "public"."seats"
    ADD CONSTRAINT "seats_library_id_row_label_column_number_key" UNIQUE ("library_id", "row_label", "column_number");



ALTER TABLE ONLY "public"."seats"
    ADD CONSTRAINT "seats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slot_configs"
    ADD CONSTRAINT "slot_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_requests"
    ADD CONSTRAINT "staff_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_provider_external_id_unique" UNIQUE ("provider", "external_event_id");



ALTER TABLE ONLY "public"."whatsapp_otp_codes"
    ADD CONSTRAINT "whatsapp_otp_codes_pkey" PRIMARY KEY ("id");



CREATE INDEX "chat_conversations_guest_idx" ON "public"."chat_conversations" USING "btree" ("guest_session_id");



CREATE INDEX "chat_conversations_user_updated_idx" ON "public"."chat_conversations" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "chat_messages_content_fts_idx" ON "public"."chat_messages" USING "gin" ("to_tsvector"('"english"'::"regconfig", "content"));



CREATE INDEX "chat_messages_conversation_created_idx" ON "public"."chat_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_admin_actions_admin" ON "public"."admin_actions" USING "btree" ("admin_id", "created_at" DESC);



CREATE INDEX "idx_admin_actions_entity" ON "public"."admin_actions" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_alert_log_delivery_status" ON "public"."alert_log" USING "btree" ("delivery_status") WHERE ("delivery_status" <> 'delivered'::"public"."alert_delivery_status");



CREATE INDEX "idx_alert_log_severity_created" ON "public"."alert_log" USING "btree" ("severity", "created_at" DESC);



CREATE INDEX "idx_book_copies_book_status" ON "public"."book_copies" USING "btree" ("book_id", "status");



CREATE INDEX "idx_book_issues_copy_id" ON "public"."book_issues" USING "btree" ("copy_id");



CREATE INDEX "idx_book_issues_user_id" ON "public"."book_issues" USING "btree" ("user_id");



CREATE INDEX "idx_book_requests_library" ON "public"."book_requests" USING "btree" ("library_id");



CREATE INDEX "idx_book_requests_user_status" ON "public"."book_requests" USING "btree" ("user_id", "status");



CREATE INDEX "idx_bookings_created_at_id_keyset" ON "public"."bookings" USING "btree" ("created_at" DESC, "id" DESC);



CREATE INDEX "idx_bookings_hold_expires" ON "public"."bookings" USING "btree" ("hold_expires_at") WHERE ("status" = 'held'::"public"."booking_status");



CREATE INDEX "idx_bookings_library_start" ON "public"."bookings" USING "btree" ("library_id", "start_time");



CREATE INDEX "idx_bookings_library_status" ON "public"."bookings" USING "btree" ("library_id", "status");



CREATE INDEX "idx_bookings_library_status_start" ON "public"."bookings" USING "btree" ("library_id", "status", "start_time");



CREATE INDEX "idx_bookings_library_time" ON "public"."bookings" USING "btree" ("library_id", "start_time", "end_time") WHERE ("status" = ANY (ARRAY['confirmed'::"public"."booking_status", 'checked_in'::"public"."booking_status", 'held'::"public"."booking_status"]));



CREATE INDEX "idx_bookings_seat_status" ON "public"."bookings" USING "btree" ("seat_id", "status");



CREATE INDEX "idx_bookings_seat_time" ON "public"."bookings" USING "btree" ("seat_id", "start_time", "end_time") WHERE ("status" = ANY (ARRAY['confirmed'::"public"."booking_status", 'checked_in'::"public"."booking_status", 'held'::"public"."booking_status"]));



CREATE INDEX "idx_bookings_seat_time_status" ON "public"."bookings" USING "btree" ("library_id", "start_time", "end_time", "status");



CREATE INDEX "idx_bookings_status" ON "public"."bookings" USING "btree" ("status");



CREATE INDEX "idx_bookings_subscription_id" ON "public"."bookings" USING "btree" ("subscription_id") WHERE ("subscription_id" IS NOT NULL);



CREATE INDEX "idx_bookings_user_status_end" ON "public"."bookings" USING "btree" ("user_id", "status", "end_time" DESC);



CREATE INDEX "idx_books_author_trgm" ON "public"."books" USING "gin" ("author" "public"."gin_trgm_ops");



CREATE INDEX "idx_books_library_id" ON "public"."books" USING "btree" ("library_id");



CREATE INDEX "idx_books_title_trgm" ON "public"."books" USING "gin" ("title" "public"."gin_trgm_ops");



CREATE INDEX "idx_coupon_redemptions_coupon_user" ON "public"."coupon_redemptions" USING "btree" ("coupon_id", "user_id");



CREATE INDEX "idx_coupons_owner_active" ON "public"."coupons" USING "btree" ("owner_id") WHERE ("is_active" = true);



CREATE INDEX "idx_financial_audit_created" ON "public"."financial_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_financial_audit_entity" ON "public"."financial_audit_log" USING "btree" ("entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "idx_financial_audit_event" ON "public"."financial_audit_log" USING "btree" ("event", "created_at" DESC);



CREATE INDEX "idx_libraries_active_geo" ON "public"."libraries" USING "btree" ("is_active", "city") WHERE ("is_active" = true);



CREATE INDEX "idx_libraries_approval_status" ON "public"."libraries" USING "btree" ("approval_status");



CREATE INDEX "idx_libraries_created_at_id_keyset" ON "public"."libraries" USING "btree" ("created_at" DESC, "id" DESC);



CREATE INDEX "idx_libraries_geo_point" ON "public"."libraries" USING "gist" ("geo_point");



CREATE INDEX "idx_libraries_owner" ON "public"."libraries" USING "btree" ("owner_id");



CREATE INDEX "idx_libraries_state_city" ON "public"."libraries" USING "btree" ("state", "city") WHERE ("is_active" = true);



CREATE INDEX "idx_library_images_library_cover" ON "public"."library_images" USING "btree" ("library_id", "is_cover");



CREATE INDEX "idx_payments_booking" ON "public"."payments" USING "btree" ("booking_id");



CREATE INDEX "idx_payments_booking_status" ON "public"."payments" USING "btree" ("booking_id", "status");



CREATE INDEX "idx_payments_created_at_id_keyset" ON "public"."payments" USING "btree" ("created_at" DESC, "id" DESC);



CREATE INDEX "idx_payments_escrow_eligible_at" ON "public"."payments" USING "btree" ("escrow_eligible_at");



CREATE INDEX "idx_payments_escrow_status" ON "public"."payments" USING "btree" ("escrow_status");



CREATE UNIQUE INDEX "idx_payments_razorpay_order" ON "public"."payments" USING "btree" ("razorpay_order_id") WHERE ("razorpay_order_id" IS NOT NULL);



CREATE INDEX "idx_payout_clawbacks_owner_status" ON "public"."payout_clawbacks" USING "btree" ("owner_id", "status");



CREATE UNIQUE INDEX "idx_payouts_idempotency_key" ON "public"."payouts" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_payouts_library" ON "public"."payouts" USING "btree" ("library_id", "created_at" DESC);



CREATE INDEX "idx_payouts_owner" ON "public"."payouts" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_payouts_status" ON "public"."payouts" USING "btree" ("status");



CREATE INDEX "idx_plan_libraries_library" ON "public"."plan_libraries" USING "btree" ("library_id");



CREATE INDEX "idx_plan_libraries_plan" ON "public"."plan_libraries" USING "btree" ("plan_id");



CREATE INDEX "idx_plans_owner" ON "public"."plans" USING "btree" ("owner_id");



CREATE INDEX "idx_platform_subscriptions_next_billing" ON "public"."platform_subscriptions" USING "btree" ("next_billing_at");



CREATE INDEX "idx_platform_subscriptions_owner" ON "public"."platform_subscriptions" USING "btree" ("owner_id");



CREATE INDEX "idx_platform_subscriptions_razorpay_sub_id" ON "public"."platform_subscriptions" USING "btree" ("razorpay_subscription_id");



CREATE INDEX "idx_platform_subscriptions_status" ON "public"."platform_subscriptions" USING "btree" ("status");



CREATE INDEX "idx_psp_owner" ON "public"."platform_subscription_payments" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_psp_razorpay_payment_id" ON "public"."platform_subscription_payments" USING "btree" ("razorpay_payment_id");



CREATE INDEX "idx_psp_subscription" ON "public"."platform_subscription_payments" USING "btree" ("platform_subscription_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_psp_unique_razorpay_payment_id" ON "public"."platform_subscription_payments" USING "btree" ("razorpay_payment_id") WHERE ("razorpay_payment_id" IS NOT NULL);



CREATE INDEX "idx_rate_limit_window" ON "public"."rate_limit_counters" USING "btree" ("window_start");



CREATE UNIQUE INDEX "idx_refunds_idempotency_key" ON "public"."refunds" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_refunds_owner" ON "public"."refunds" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_refunds_payment" ON "public"."refunds" USING "btree" ("payment_id");



CREATE INDEX "idx_refunds_status" ON "public"."refunds" USING "btree" ("status");



CREATE INDEX "idx_refunds_student" ON "public"."refunds" USING "btree" ("student_id", "created_at" DESC);



CREATE INDEX "idx_seats_library_active" ON "public"."seats" USING "btree" ("library_id", "is_active");



CREATE INDEX "idx_slot_configs_library" ON "public"."slot_configs" USING "btree" ("library_id");



CREATE INDEX "idx_slot_configs_library_active" ON "public"."slot_configs" USING "btree" ("library_id", "is_active");



CREATE INDEX "idx_staff_library_id" ON "public"."staff" USING "btree" ("library_id");



CREATE INDEX "idx_staff_requests_library_id" ON "public"."staff_requests" USING "btree" ("library_id");



CREATE INDEX "idx_staff_requests_user_id" ON "public"."staff_requests" USING "btree" ("user_id");



CREATE INDEX "idx_staff_user_id" ON "public"."staff" USING "btree" ("user_id");



CREATE INDEX "idx_subscriptions_plan_status" ON "public"."subscriptions" USING "btree" ("plan_id", "status");



CREATE INDEX "idx_subscriptions_user_status" ON "public"."subscriptions" USING "btree" ("user_id", "status");



CREATE INDEX "idx_webhook_events_status" ON "public"."webhook_events" USING "btree" ("status", "received_at");



CREATE INDEX "idx_webhook_events_type" ON "public"."webhook_events" USING "btree" ("event_type", "received_at" DESC);



CREATE INDEX "libraries_lat_lng_idx" ON "public"."libraries" USING "btree" ("latitude", "longitude") WHERE ("is_active" = true);



CREATE INDEX "libraries_trial_ends_at_idx" ON "public"."libraries" USING "btree" ("trial_ends_at") WHERE ("trial_ends_at" IS NOT NULL);



CREATE INDEX "notifications_library_recent" ON "public"."notifications" USING "btree" ("library_id", "created_at" DESC);



CREATE INDEX "notifications_subscription_id_idx" ON "public"."notifications" USING "btree" ("subscription_id") WHERE ("subscription_id" IS NOT NULL);



CREATE INDEX "notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE UNIQUE INDEX "payments_one_pending_per_booking" ON "public"."payments" USING "btree" ("booking_id") WHERE ("status" = 'pending'::"public"."payment_status");



CREATE UNIQUE INDEX "payments_razorpay_order_id_unique" ON "public"."payments" USING "btree" ("razorpay_order_id") WHERE ("razorpay_order_id" IS NOT NULL);



CREATE UNIQUE INDEX "users_whatsapp_number_unique" ON "public"."users" USING "btree" ("whatsapp_number") WHERE ("whatsapp_number" IS NOT NULL);



CREATE INDEX "whatsapp_otp_codes_user_id_idx" ON "public"."whatsapp_otp_codes" USING "btree" ("user_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "chat_messages_touch_conversation" AFTER INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."touch_chat_conversation"();



CREATE OR REPLACE TRIGGER "trg_book_request_notify" AFTER UPDATE OF "status" ON "public"."book_requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_book_request_update"();



CREATE OR REPLACE TRIGGER "trg_enforce_booking_self_update" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_booking_self_update"();



CREATE OR REPLACE TRIGGER "trg_enforce_library_activation_requirements" BEFORE INSERT OR UPDATE OF "is_active" ON "public"."libraries" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_library_activation_requirements"();



CREATE OR REPLACE TRIGGER "trg_expire_holds_before_insert" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."expire_holds_before_insert"();



CREATE OR REPLACE TRIGGER "trg_mark_escrow_eligible_on_checkin" AFTER UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."mark_escrow_eligible_on_checkin"();



CREATE OR REPLACE TRIGGER "trg_payout_clawbacks_touch" BEFORE UPDATE ON "public"."payout_clawbacks" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_payouts_touch" BEFORE UPDATE ON "public"."payouts" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_platform_subscriptions_touch" BEFORE UPDATE ON "public"."platform_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_prevent_role_self_elevation" BEFORE UPDATE OF "role" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_role_self_elevation"();



CREATE OR REPLACE TRIGGER "trg_refunds_touch" BEFORE UPDATE ON "public"."refunds" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_checked_in_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."set_checked_in_at"();



CREATE OR REPLACE TRIGGER "trg_slot_configs_updated_at" BEFORE UPDATE ON "public"."slot_configs" FOR EACH ROW EXECUTE FUNCTION "public"."set_slot_configs_updated_at"();



ALTER TABLE ONLY "public"."admin_actions"
    ADD CONSTRAINT "admin_actions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."book_copies"
    ADD CONSTRAINT "book_copies_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id");



ALTER TABLE ONLY "public"."book_issues"
    ADD CONSTRAINT "book_issues_copy_id_fkey" FOREIGN KEY ("copy_id") REFERENCES "public"."book_copies"("id");



ALTER TABLE ONLY "public"."book_issues"
    ADD CONSTRAINT "book_issues_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."book_requests"
    ADD CONSTRAINT "book_requests_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id");



ALTER TABLE ONLY "public"."book_requests"
    ADD CONSTRAINT "book_requests_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id");



ALTER TABLE ONLY "public"."book_requests"
    ADD CONSTRAINT "book_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."book_requests"
    ADD CONSTRAINT "book_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."books"
    ADD CONSTRAINT "books_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id");



ALTER TABLE ONLY "public"."chat_conversations"
    ADD CONSTRAINT "chat_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id");



ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id");



ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."financial_audit_log"
    ADD CONSTRAINT "financial_audit_log_webhook_event_id_fkey" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."webhook_events"("id");



ALTER TABLE ONLY "public"."libraries"
    ADD CONSTRAINT "libraries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."libraries"
    ADD CONSTRAINT "libraries_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."libraries"
    ADD CONSTRAINT "libraries_suspended_by_fkey" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."library_amenities"
    ADD CONSTRAINT "library_amenities_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."library_amenities"
    ADD CONSTRAINT "library_amenities_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."library_images"
    ADD CONSTRAINT "library_images_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."payout_clawbacks"
    ADD CONSTRAINT "payout_clawbacks_original_payout_id_fkey" FOREIGN KEY ("original_payout_id") REFERENCES "public"."payouts"("id");



ALTER TABLE ONLY "public"."payout_clawbacks"
    ADD CONSTRAINT "payout_clawbacks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."payout_clawbacks"
    ADD CONSTRAINT "payout_clawbacks_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_last_webhook_event_id_fkey" FOREIGN KEY ("last_webhook_event_id") REFERENCES "public"."webhook_events"("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id");



ALTER TABLE ONLY "public"."plan_libraries"
    ADD CONSTRAINT "plan_libraries_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_libraries"
    ADD CONSTRAINT "plan_libraries_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."platform_subscription_payments"
    ADD CONSTRAINT "platform_subscription_payments_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id");



ALTER TABLE ONLY "public"."platform_subscription_payments"
    ADD CONSTRAINT "platform_subscription_payments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."platform_subscription_payments"
    ADD CONSTRAINT "platform_subscription_payments_platform_subscription_id_fkey" FOREIGN KEY ("platform_subscription_id") REFERENCES "public"."platform_subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_subscriptions"
    ADD CONSTRAINT "platform_subscriptions_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_subscriptions"
    ADD CONSTRAINT "platform_subscriptions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."seats"
    ADD CONSTRAINT "seats_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slot_configs"
    ADD CONSTRAINT "slot_configs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."slot_configs"
    ADD CONSTRAINT "slot_configs_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id");



ALTER TABLE ONLY "public"."staff_requests"
    ADD CONSTRAINT "staff_requests_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id");



ALTER TABLE ONLY "public"."staff_requests"
    ADD CONSTRAINT "staff_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."whatsapp_otp_codes"
    ADD CONSTRAINT "whatsapp_otp_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Owners can delete library images" ON "public"."library_images" FOR DELETE TO "authenticated" USING ((( SELECT "libraries"."owner_id"
   FROM "public"."libraries"
  WHERE ("libraries"."id" = "library_images"."library_id")) = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Owners can insert library images" ON "public"."library_images" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "libraries"."owner_id"
   FROM "public"."libraries"
  WHERE ("libraries"."id" = "library_images"."library_id")) = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Owners can update library images" ON "public"."library_images" FOR UPDATE TO "authenticated" USING ((( SELECT "libraries"."owner_id"
   FROM "public"."libraries"
  WHERE ("libraries"."id" = "library_images"."library_id")) = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Public can read library images" ON "public"."library_images" FOR SELECT USING (true);



ALTER TABLE "public"."admin_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_insert_own_actions" ON "public"."admin_actions" FOR INSERT TO "authenticated" WITH CHECK ((("admin_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_admin"()));



CREATE POLICY "admin_manage_clawbacks" ON "public"."payout_clawbacks" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_manage_libraries" ON "public"."libraries" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_manage_payments" ON "public"."payments" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_manage_payouts" ON "public"."payouts" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_manage_platform_subscription_payments" ON "public"."platform_subscription_payments" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_manage_platform_subscriptions" ON "public"."platform_subscriptions" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_manage_refunds" ON "public"."refunds" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK (("public"."is_admin"() AND (("initiated_by" = ( SELECT "auth"."uid"() AS "uid")) OR (("initiated_by" IS NULL) AND ("resolved_by" = ( SELECT "auth"."uid"() AS "uid"))) OR ("resolved_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "admin_read_alert_log" ON "public"."alert_log" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_all_actions" ON "public"."admin_actions" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_all_conversations" ON "public"."chat_conversations" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_all_messages" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_all_notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_all_users" ON "public"."users" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_financial_audit_log" ON "public"."financial_audit_log" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_webhook_events" ON "public"."webhook_events" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_update_users" ON "public"."users" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."alert_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."amenities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated users can read basic profiles" ON "public"."users" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_insert_own_notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "authenticated_read_plans" ON "public"."plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_view_library_bookings_for_availability" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("library_id" IN ( SELECT "libraries"."id"
   FROM "public"."libraries"
  WHERE ("libraries"."is_active" = true))));



ALTER TABLE "public"."book_copies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."book_issues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."book_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."books" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "books_delete_senior_staff" ON "public"."books" FOR DELETE USING (( SELECT "public"."is_senior_staff_of"("books"."library_id") AS "is_senior_staff_of"));



CREATE POLICY "books_insert_senior_staff" ON "public"."books" FOR INSERT WITH CHECK (( SELECT "public"."is_senior_staff_of"("books"."library_id") AS "is_senior_staff_of"));



CREATE POLICY "books_read_authenticated" ON "public"."books" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "books_update_senior_staff" ON "public"."books" FOR UPDATE USING (( SELECT "public"."is_senior_staff_of"("books"."library_id") AS "is_senior_staff_of"));



ALTER TABLE "public"."chat_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "copies_delete_senior_staff" ON "public"."book_copies" FOR DELETE USING (( SELECT "public"."is_senior_staff_of"(( SELECT "books"."library_id"
           FROM "public"."books"
          WHERE ("books"."id" = "book_copies"."book_id"))) AS "is_senior_staff_of"));



CREATE POLICY "copies_insert_senior_staff" ON "public"."book_copies" FOR INSERT WITH CHECK (( SELECT "public"."is_senior_staff_of"(( SELECT "books"."library_id"
           FROM "public"."books"
          WHERE ("books"."id" = "book_copies"."book_id"))) AS "is_senior_staff_of"));



CREATE POLICY "copies_read_authenticated" ON "public"."book_copies" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "copies_update_staff" ON "public"."book_copies" FOR UPDATE USING (( SELECT "public"."is_staff_of"(( SELECT "books"."library_id"
           FROM "public"."books"
          WHERE ("books"."id" = "book_copies"."book_id"))) AS "is_staff_of"));



ALTER TABLE "public"."coupon_redemptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "issues_insert_staff" ON "public"."book_issues" FOR INSERT WITH CHECK (( SELECT "public"."is_staff_of"(( SELECT "b"."library_id"
           FROM ("public"."books" "b"
             JOIN "public"."book_copies" "bc" ON (("bc"."book_id" = "b"."id")))
          WHERE ("bc"."id" = "book_issues"."copy_id"))) AS "is_staff_of"));



CREATE POLICY "issues_read_staff" ON "public"."book_issues" FOR SELECT USING ((( SELECT "public"."is_staff_of"(( SELECT "b"."library_id"
           FROM ("public"."books" "b"
             JOIN "public"."book_copies" "bc" ON (("bc"."book_id" = "b"."id")))
          WHERE ("bc"."id" = "book_issues"."copy_id"))) AS "is_staff_of") OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "issues_update_staff" ON "public"."book_issues" FOR UPDATE USING (( SELECT "public"."is_staff_of"(( SELECT "b"."library_id"
           FROM ("public"."books" "b"
             JOIN "public"."book_copies" "bc" ON (("bc"."book_id" = "b"."id")))
          WHERE ("bc"."id" = "book_issues"."copy_id"))) AS "is_staff_of"));



ALTER TABLE "public"."libraries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."library_amenities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."library_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owner_manage_bookings" ON "public"."bookings" USING (("library_id" IN ( SELECT "libraries"."id"
   FROM "public"."libraries"
  WHERE ("libraries"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "owner_manage_library" ON "public"."libraries" USING ((( SELECT "auth"."uid"() AS "uid") = "owner_id"));



CREATE POLICY "owner_manage_library_amenities" ON "public"."library_amenities" USING (("library_id" IN ( SELECT "libraries"."id"
   FROM "public"."libraries"
  WHERE ("libraries"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("library_id" IN ( SELECT "libraries"."id"
   FROM "public"."libraries"
  WHERE ("libraries"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "owner_manage_library_images" ON "public"."library_images" USING (("library_id" IN ( SELECT "libraries"."id"
   FROM "public"."libraries"
  WHERE ("libraries"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("library_id" IN ( SELECT "libraries"."id"
   FROM "public"."libraries"
  WHERE ("libraries"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "owner_manage_own_coupons" ON "public"."coupons" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "owner_manage_plan_libraries" ON "public"."plan_libraries" USING (("plan_id" IN ( SELECT "plans"."id"
   FROM "public"."plans"
  WHERE ("plans"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("plan_id" IN ( SELECT "plans"."id"
   FROM "public"."plans"
  WHERE ("plans"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "owner_manage_plans" ON "public"."plans" USING ((( SELECT "auth"."uid"() AS "uid") = "owner_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "owner_id"));



CREATE POLICY "owner_manage_seats" ON "public"."seats" USING (("library_id" IN ( SELECT "libraries"."id"
   FROM "public"."libraries"
  WHERE ("libraries"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("library_id" IN ( SELECT "libraries"."id"
   FROM "public"."libraries"
  WHERE ("libraries"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "owner_manage_staff" ON "public"."staff" USING (("library_id" IN ( SELECT "libraries"."id"
   FROM "public"."libraries"
  WHERE ("libraries"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("library_id" IN ( SELECT "libraries"."id"
   FROM "public"."libraries"
  WHERE ("libraries"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "owner_staff_insert_guest_payments" ON "public"."payments" FOR INSERT WITH CHECK ((("user_id" IS NULL) AND ("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE ("b"."library_id" IN ( SELECT "l"."id"
           FROM "public"."libraries" "l"
          WHERE ("l"."owner_id" = "auth"."uid"())
        UNION
         SELECT "s"."library_id"
           FROM "public"."staff" "s"
          WHERE ("s"."user_id" = "auth"."uid"())))))));



CREATE POLICY "owner_view_own_clawbacks" ON "public"."payout_clawbacks" FOR SELECT TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "owner_view_own_coupon_redemptions" ON "public"."coupon_redemptions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."coupons" "c"
  WHERE (("c"."id" = "coupon_redemptions"."coupon_id") AND ("c"."owner_id" = "auth"."uid"())))));



CREATE POLICY "owner_view_own_payouts" ON "public"."payouts" FOR SELECT TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "owner_view_own_platform_subscription" ON "public"."platform_subscriptions" FOR SELECT TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "owner_view_own_platform_subscription_payments" ON "public"."platform_subscription_payments" FOR SELECT TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "owner_view_own_refunds" ON "public"."refunds" FOR SELECT TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "owner_view_payments" ON "public"."payments" FOR SELECT USING (("booking_id" IN ( SELECT "bookings"."id"
   FROM "public"."bookings"
  WHERE ("bookings"."library_id" IN ( SELECT "libraries"."id"
           FROM "public"."libraries"
          WHERE ("libraries"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "owner_view_subscriptions" ON "public"."subscriptions" FOR SELECT USING (("plan_id" IN ( SELECT "plans"."id"
   FROM "public"."plans"
  WHERE ("plans"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payout_clawbacks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_libraries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_subscription_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_view_active_seats" ON "public"."seats" FOR SELECT USING (("is_active" = true));



CREATE POLICY "public_view_amenities" ON "public"."amenities" FOR SELECT USING (true);



CREATE POLICY "public_view_approved_active_libraries" ON "public"."libraries" FOR SELECT USING ((("approval_status" = 'approved'::"public"."library_approval_status") AND ("is_active" = true) AND "public"."has_active_platform_subscription"("id")));



CREATE POLICY "public_view_library_amenities" ON "public"."library_amenities" FOR SELECT USING (true);



CREATE POLICY "public_view_library_images" ON "public"."library_images" FOR SELECT USING (true);



CREATE POLICY "public_view_plan_libraries" ON "public"."plan_libraries" FOR SELECT USING (true);



ALTER TABLE "public"."rate_limit_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."refunds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "requests_insert_student" ON "public"."book_requests" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "requests_read_own" ON "public"."book_requests" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_staff_of"("book_requests"."library_id") AS "is_staff_of")));



CREATE POLICY "requests_update_own_cancel" ON "public"."book_requests" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_staff_of"("book_requests"."library_id") AS "is_staff_of")));



ALTER TABLE "public"."seats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."slot_configs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "slot_configs_owner_all" ON "public"."slot_configs" USING ((EXISTS ( SELECT 1
   FROM "public"."libraries" "l"
  WHERE (("l"."id" = "slot_configs"."library_id") AND ("l"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."libraries" "l"
  WHERE (("l"."id" = "slot_configs"."library_id") AND ("l"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "slot_configs_public_read_active" ON "public"."slot_configs" FOR SELECT USING ((("is_active" = true) AND (EXISTS ( SELECT 1
   FROM "public"."libraries" "l"
  WHERE (("l"."id" = "slot_configs"."library_id") AND ("l"."is_active" = true))))));



ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_insert_booking" ON "public"."bookings" FOR INSERT WITH CHECK ((("user_id" IS NULL) AND ("library_id" IN ( SELECT "staff"."library_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."staff_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_requests_delete" ON "public"."staff_requests" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "staff_requests_insert" ON "public"."staff_requests" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "staff_requests_select" ON "public"."staff_requests" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("library_id" IN ( SELECT "libraries"."id"
   FROM "public"."libraries"
  WHERE ("libraries"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "staff_requests_update" ON "public"."staff_requests" FOR UPDATE TO "authenticated" USING (("library_id" IN ( SELECT "libraries"."id"
   FROM "public"."libraries"
  WHERE ("libraries"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("library_id" IN ( SELECT "libraries"."id"
   FROM "public"."libraries"
  WHERE ("libraries"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "staff_update_booking" ON "public"."bookings" FOR UPDATE USING (("library_id" IN ( SELECT "staff"."library_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "staff_view_library_bookings" ON "public"."bookings" FOR SELECT USING (("library_id" IN ( SELECT "staff"."library_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "staff_view_own" ON "public"."staff" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "student_view_own_redemptions" ON "public"."coupon_redemptions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "student_view_own_refunds" ON "public"."refunds" FOR SELECT TO "authenticated" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_insert_payments" ON "public"."payments" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "user_create_booking" ON "public"."bookings" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "user_delete_own_conversations" ON "public"."chat_conversations" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_insert_own_conversations" ON "public"."chat_conversations" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_insert_own_messages" ON "public"."chat_messages" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."chat_conversations" "c"
  WHERE (("c"."id" = "chat_messages"."conversation_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "user_insert_own_notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_manage_subscriptions" ON "public"."subscriptions" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "user_read_own_conversations" ON "public"."chat_conversations" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_read_own_messages" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chat_conversations" "c"
  WHERE (("c"."id" = "chat_messages"."conversation_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "user_read_own_notifications" ON "public"."notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_update_own_booking" ON "public"."bookings" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_update_own_conversations" ON "public"."chat_conversations" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_update_own_notifications" ON "public"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_view_own" ON "public"."bookings" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "user_view_own_payments" ON "public"."payments" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_insert_own" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "users_select_own" ON "public"."users" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_otp_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_otp_own_select" ON "public"."whatsapp_otp_codes" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT ALL ON SCHEMA "public" TO "anon";
GRANT ALL ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_booking_extension_captured"("p_booking_id" "uuid", "p_expected_user_id" "uuid", "p_new_end_time" timestamp without time zone, "p_razorpay_order_id" "text", "p_razorpay_payment_id" "text", "p_commission_bps" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_booking_extension_captured"("p_booking_id" "uuid", "p_expected_user_id" "uuid", "p_new_end_time" timestamp without time zone, "p_razorpay_order_id" "text", "p_razorpay_payment_id" "text", "p_commission_bps" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_booking_extension_captured"("p_booking_id" "uuid", "p_expected_user_id" "uuid", "p_new_end_time" timestamp without time zone, "p_razorpay_order_id" "text", "p_razorpay_payment_id" "text", "p_commission_bps" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_booking_payment_captured"("p_booking_id" "uuid", "p_expected_user_id" "uuid", "p_razorpay_order_id" "text", "p_razorpay_payment_id" "text", "p_commission_bps" integer, "p_actor_type" "text", "p_actor_id" "uuid", "p_webhook_event_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_booking_payment_captured"("p_booking_id" "uuid", "p_expected_user_id" "uuid", "p_razorpay_order_id" "text", "p_razorpay_payment_id" "text", "p_commission_bps" integer, "p_actor_type" "text", "p_actor_id" "uuid", "p_webhook_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_booking_payment_captured"("p_booking_id" "uuid", "p_expected_user_id" "uuid", "p_razorpay_order_id" "text", "p_razorpay_payment_id" "text", "p_commission_bps" integer, "p_actor_type" "text", "p_actor_id" "uuid", "p_webhook_event_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_held_booking_with_payment"("p_user_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone, "p_hold_expires_at" timestamp without time zone, "p_amount" numeric, "p_razorpay_order_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_held_booking_with_payment"("p_user_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone, "p_hold_expires_at" timestamp without time zone, "p_amount" numeric, "p_razorpay_order_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_held_booking_with_payment"("p_user_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone, "p_hold_expires_at" timestamp without time zone, "p_amount" numeric, "p_razorpay_order_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_held_booking_with_payment"("p_user_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone, "p_hold_expires_at" timestamp without time zone, "p_amount" numeric, "p_razorpay_order_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_held_booking_with_payment"("p_user_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone, "p_hold_expires_at" timestamp without time zone, "p_amount" numeric, "p_razorpay_order_id" "text", "p_base_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."create_held_booking_with_payment"("p_user_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone, "p_hold_expires_at" timestamp without time zone, "p_amount" numeric, "p_razorpay_order_id" "text", "p_base_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_held_booking_with_payment"("p_user_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone, "p_hold_expires_at" timestamp without time zone, "p_amount" numeric, "p_razorpay_order_id" "text", "p_base_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_pending_subscription_with_payment"("p_user_id" "uuid", "p_plan_id" "uuid", "p_library_id" "uuid", "p_razorpay_order_id" "text", "p_expected_total" numeric, "p_coupon_code" "text", "p_commission_bps" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_pending_subscription_with_payment"("p_user_id" "uuid", "p_plan_id" "uuid", "p_library_id" "uuid", "p_razorpay_order_id" "text", "p_expected_total" numeric, "p_coupon_code" "text", "p_commission_bps" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_pending_subscription_with_payment"("p_user_id" "uuid", "p_plan_id" "uuid", "p_library_id" "uuid", "p_razorpay_order_id" "text", "p_expected_total" numeric, "p_coupon_code" "text", "p_commission_bps" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_refund_if_within_balance"("p_payment_id" "uuid", "p_amount" numeric, "p_refund_type" "public"."refund_type", "p_reason" "text", "p_admin_notes" "text", "p_initiated_by" "uuid", "p_booking_id" "uuid", "p_student_id" "uuid", "p_library_id" "uuid", "p_owner_id" "uuid", "p_payout_already_settled" boolean, "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_refund_if_within_balance"("p_payment_id" "uuid", "p_amount" numeric, "p_refund_type" "public"."refund_type", "p_reason" "text", "p_admin_notes" "text", "p_initiated_by" "uuid", "p_booking_id" "uuid", "p_student_id" "uuid", "p_library_id" "uuid", "p_owner_id" "uuid", "p_payout_already_settled" boolean, "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_refund_if_within_balance"("p_payment_id" "uuid", "p_amount" numeric, "p_refund_type" "public"."refund_type", "p_reason" "text", "p_admin_notes" "text", "p_initiated_by" "uuid", "p_booking_id" "uuid", "p_student_id" "uuid", "p_library_id" "uuid", "p_owner_id" "uuid", "p_payout_already_settled" boolean, "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_subscription_covered_booking"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."create_subscription_covered_booking"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_subscription_covered_booking"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_library_id" "uuid", "p_seat_id" "uuid", "p_start_time" timestamp without time zone, "p_end_time" timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_booking_self_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_booking_self_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_booking_self_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_library_activation_requirements"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_library_activation_requirements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_library_activation_requirements"() TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_holds_before_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_holds_before_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_holds_before_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_stale_holds"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_stale_holds"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_stale_holds"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_stuck_pending_payments"("p_older_than" interval) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_stuck_pending_payments"("p_older_than" interval) TO "anon";
GRANT ALL ON FUNCTION "public"."find_stuck_pending_payments"("p_older_than" interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_stuck_pending_payments"("p_older_than" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_active_platform_subscription"("lib_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_active_platform_subscription"("lib_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_active_platform_subscription"("lib_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_booking_reminders"() TO "anon";
GRANT ALL ON FUNCTION "public"."insert_booking_reminders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_booking_reminders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_whatsapp_otp"("p_whatsapp_number" "text", "p_code_hash" "text", "p_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."insert_whatsapp_otp"("p_whatsapp_number" "text", "p_code_hash" "text", "p_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_whatsapp_otp"("p_whatsapp_number" "text", "p_code_hash" "text", "p_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_senior_staff_of"("lib_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_senior_staff_of"("lib_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_senior_staff_of"("lib_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff_of"("lib_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff_of"("lib_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff_of"("lib_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_financial_event"("p_entity_type" "text", "p_entity_id" "uuid", "p_event" "text", "p_amount" numeric, "p_previous_state" "jsonb", "p_new_state" "jsonb", "p_actor_type" "text", "p_actor_id" "uuid", "p_webhook_event_id" "uuid", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_financial_event"("p_entity_type" "text", "p_entity_id" "uuid", "p_event" "text", "p_amount" numeric, "p_previous_state" "jsonb", "p_new_state" "jsonb", "p_actor_type" "text", "p_actor_id" "uuid", "p_webhook_event_id" "uuid", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_financial_event"("p_entity_type" "text", "p_entity_id" "uuid", "p_event" "text", "p_amount" numeric, "p_previous_state" "jsonb", "p_new_state" "jsonb", "p_actor_type" "text", "p_actor_id" "uuid", "p_webhook_event_id" "uuid", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_escrow_eligible_on_checkin"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_escrow_eligible_on_checkin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_escrow_eligible_on_checkin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_whatsapp_otp_attempt"("p_id" "uuid", "p_consumed" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_whatsapp_otp_attempt"("p_id" "uuid", "p_consumed" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_whatsapp_otp_attempt"("p_id" "uuid", "p_consumed" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."monthly_revenue"("p_library_id" "uuid", "p_since" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."monthly_revenue"("p_library_id" "uuid", "p_since" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."monthly_revenue"("p_library_id" "uuid", "p_since" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_book_request_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_book_request_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_book_request_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_user"("p_user_id" "uuid", "p_event" "text", "p_title" "text", "p_body" "text", "p_payload" "jsonb", "p_library_id" "uuid", "p_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."notify_user"("p_user_id" "uuid", "p_event" "text", "p_title" "text", "p_body" "text", "p_payload" "jsonb", "p_library_id" "uuid", "p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_user"("p_user_id" "uuid", "p_event" "text", "p_title" "text", "p_body" "text", "p_payload" "jsonb", "p_library_id" "uuid", "p_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."now_ist"() TO "anon";
GRANT ALL ON FUNCTION "public"."now_ist"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."now_ist"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_role_self_elevation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_role_self_elevation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_role_self_elevation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rate_limit_increment"("p_key" "text", "p_window_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."rate_limit_increment"("p_key" "text", "p_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rate_limit_increment"("p_key" "text", "p_window_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_libraries_by_distance"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_libraries_by_distance"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_libraries_by_distance"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_checked_in_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_checked_in_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_checked_in_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_slot_configs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_slot_configs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_slot_configs_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."slot_has_active_bookings"("p_slot_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."slot_has_active_bookings"("p_slot_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."slot_has_active_bookings"("p_slot_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."slot_has_active_bookings"("p_slot_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sweep_complete_ended_bookings"() TO "anon";
GRANT ALL ON FUNCTION "public"."sweep_complete_ended_bookings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sweep_complete_ended_bookings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sweep_deactivate_expired_trials"() TO "anon";
GRANT ALL ON FUNCTION "public"."sweep_deactivate_expired_trials"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sweep_deactivate_expired_trials"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sweep_dead_letter_webhooks"() TO "anon";
GRANT ALL ON FUNCTION "public"."sweep_dead_letter_webhooks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sweep_dead_letter_webhooks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sweep_expire_lapsed_subscriptions"() TO "anon";
GRANT ALL ON FUNCTION "public"."sweep_expire_lapsed_subscriptions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sweep_expire_lapsed_subscriptions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sweep_expire_stale_holds"() TO "anon";
GRANT ALL ON FUNCTION "public"."sweep_expire_stale_holds"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sweep_expire_stale_holds"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sweep_mark_eligible_started_checkins"() TO "anon";
GRANT ALL ON FUNCTION "public"."sweep_mark_eligible_started_checkins"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sweep_mark_eligible_started_checkins"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sweep_old_rate_limit_windows"() TO "anon";
GRANT ALL ON FUNCTION "public"."sweep_old_rate_limit_windows"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sweep_old_rate_limit_windows"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_chat_conversation"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_chat_conversation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_chat_conversation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trial_days_remaining"("lib_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."trial_days_remaining"("lib_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trial_days_remaining"("lib_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."try_lock_seat"("p_seat_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."try_lock_seat"("p_seat_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."try_lock_seat"("p_seat_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."admin_actions" TO "anon";
GRANT ALL ON TABLE "public"."admin_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_actions" TO "service_role";



GRANT ALL ON TABLE "public"."alert_log" TO "anon";
GRANT ALL ON TABLE "public"."alert_log" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_log" TO "service_role";



GRANT ALL ON TABLE "public"."amenities" TO "anon";
GRANT ALL ON TABLE "public"."amenities" TO "authenticated";
GRANT ALL ON TABLE "public"."amenities" TO "service_role";



GRANT ALL ON TABLE "public"."book_copies" TO "anon";
GRANT ALL ON TABLE "public"."book_copies" TO "authenticated";
GRANT ALL ON TABLE "public"."book_copies" TO "service_role";



GRANT ALL ON TABLE "public"."book_issues" TO "anon";
GRANT ALL ON TABLE "public"."book_issues" TO "authenticated";
GRANT ALL ON TABLE "public"."book_issues" TO "service_role";



GRANT ALL ON TABLE "public"."book_requests" TO "anon";
GRANT ALL ON TABLE "public"."book_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."book_requests" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."books" TO "anon";
GRANT ALL ON TABLE "public"."books" TO "authenticated";
GRANT ALL ON TABLE "public"."books" TO "service_role";



GRANT ALL ON TABLE "public"."chat_conversations" TO "anon";
GRANT ALL ON TABLE "public"."chat_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."coupon_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."coupon_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon_redemptions" TO "service_role";



GRANT ALL ON TABLE "public"."coupons" TO "anon";
GRANT ALL ON TABLE "public"."coupons" TO "authenticated";
GRANT ALL ON TABLE "public"."coupons" TO "service_role";



GRANT ALL ON TABLE "public"."daily_booking_trend" TO "anon";
GRANT ALL ON TABLE "public"."daily_booking_trend" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_booking_trend" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."platform_subscription_payments" TO "anon";
GRANT ALL ON TABLE "public"."platform_subscription_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_subscription_payments" TO "service_role";



GRANT ALL ON TABLE "public"."daily_revenue_trend" TO "anon";
GRANT ALL ON TABLE "public"."daily_revenue_trend" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_revenue_trend" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."daily_user_growth" TO "anon";
GRANT ALL ON TABLE "public"."daily_user_growth" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_user_growth" TO "service_role";



GRANT ALL ON TABLE "public"."financial_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."financial_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."libraries" TO "anon";
GRANT ALL ON TABLE "public"."libraries" TO "authenticated";
GRANT ALL ON TABLE "public"."libraries" TO "service_role";



GRANT ALL ON TABLE "public"."library_amenities" TO "anon";
GRANT ALL ON TABLE "public"."library_amenities" TO "authenticated";
GRANT ALL ON TABLE "public"."library_amenities" TO "service_role";



GRANT ALL ON TABLE "public"."library_images" TO "anon";
GRANT ALL ON TABLE "public"."library_images" TO "authenticated";
GRANT ALL ON TABLE "public"."library_images" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_platform_trend" TO "anon";
GRANT ALL ON TABLE "public"."monthly_platform_trend" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_platform_trend" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payout_clawbacks" TO "anon";
GRANT ALL ON TABLE "public"."payout_clawbacks" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_clawbacks" TO "service_role";



GRANT ALL ON TABLE "public"."payouts" TO "anon";
GRANT ALL ON TABLE "public"."payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."payouts" TO "service_role";



GRANT ALL ON TABLE "public"."pending_no_show_escrow" TO "anon";
GRANT ALL ON TABLE "public"."pending_no_show_escrow" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_no_show_escrow" TO "service_role";



GRANT ALL ON TABLE "public"."plan_libraries" TO "anon";
GRANT ALL ON TABLE "public"."plan_libraries" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_libraries" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."platform_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."platform_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."refunds" TO "anon";
GRANT ALL ON TABLE "public"."refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."refunds" TO "service_role";



GRANT ALL ON TABLE "public"."platform_overview" TO "anon";
GRANT ALL ON TABLE "public"."platform_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_overview" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_counters" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_counters" TO "service_role";



GRANT ALL ON TABLE "public"."seats" TO "anon";
GRANT ALL ON TABLE "public"."seats" TO "authenticated";
GRANT ALL ON TABLE "public"."seats" TO "service_role";



GRANT ALL ON TABLE "public"."settlement_summary" TO "anon";
GRANT ALL ON TABLE "public"."settlement_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."settlement_summary" TO "service_role";



GRANT ALL ON TABLE "public"."slot_configs" TO "anon";
GRANT ALL ON TABLE "public"."slot_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."slot_configs" TO "service_role";



GRANT ALL ON TABLE "public"."staff" TO "anon";
GRANT ALL ON TABLE "public"."staff" TO "authenticated";
GRANT ALL ON TABLE "public"."staff" TO "service_role";



GRANT ALL ON TABLE "public"."staff_requests" TO "anon";
GRANT ALL ON TABLE "public"."staff_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_requests" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_dead_letters" TO "anon";
GRANT ALL ON TABLE "public"."webhook_dead_letters" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_dead_letters" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_platform_trend" TO "anon";
GRANT ALL ON TABLE "public"."weekly_platform_trend" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_platform_trend" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_otp_codes" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_otp_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_otp_codes" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







