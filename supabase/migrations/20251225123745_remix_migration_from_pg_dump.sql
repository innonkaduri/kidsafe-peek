CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  
  INSERT INTO public.notification_settings (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    ip_address text,
    user_agent text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_id uuid NOT NULL,
    import_id uuid,
    chat_name text NOT NULL,
    participant_count integer DEFAULT 2,
    is_group boolean DEFAULT false,
    is_watchlisted boolean DEFAULT false,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: children; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.children (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    display_name text NOT NULL,
    age_range text,
    avatar_url text,
    consent_ack_at timestamp with time zone,
    monitoring_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    teacher_email text,
    CONSTRAINT children_age_range_check CHECK ((age_range = ANY (ARRAY['6-9'::text, '10-12'::text, '13-15'::text, '16-18'::text])))
);


--
-- Name: connector_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connector_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_source_id uuid NOT NULL,
    instance_id text,
    token_encrypted text,
    last_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    api_token text,
    status text DEFAULT 'pending'::text,
    child_id uuid
);


--
-- Name: data_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_id uuid NOT NULL,
    source_type text NOT NULL,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT data_sources_source_type_check CHECK ((source_type = ANY (ARRAY['manual_import'::text, 'connector'::text]))),
    CONSTRAINT data_sources_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'error'::text])))
);


--
-- Name: evidence_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidence_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    finding_id uuid NOT NULL,
    message_id uuid,
    evidence_type text NOT NULL,
    preview_text text,
    preview_media_url text,
    confidence numeric(3,2),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT evidence_items_evidence_type_check CHECK ((evidence_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text])))
);


--
-- Name: findings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.findings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scan_id uuid NOT NULL,
    child_id uuid NOT NULL,
    threat_detected boolean DEFAULT false NOT NULL,
    risk_level text,
    threat_types jsonb DEFAULT '[]'::jsonb,
    explanation text,
    ai_response_encrypted jsonb,
    created_at timestamp with time zone DEFAULT now(),
    handled boolean DEFAULT false,
    handled_at timestamp with time zone,
    CONSTRAINT findings_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
);


--
-- Name: forum_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_id uuid NOT NULL,
    filename text NOT NULL,
    file_size bigint,
    status text DEFAULT 'pending'::text,
    chats_count integer DEFAULT 0,
    messages_count integer DEFAULT 0,
    media_count integer DEFAULT 0,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT imports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_id uuid NOT NULL,
    chat_id uuid NOT NULL,
    sender_label text NOT NULL,
    is_child_sender boolean DEFAULT false,
    msg_type text NOT NULL,
    message_timestamp timestamp with time zone NOT NULL,
    text_content text,
    text_excerpt text,
    media_url text,
    media_thumbnail_url text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT messages_msg_type_check CHECK ((msg_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'file'::text, 'sticker'::text])))
);


--
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_enabled boolean DEFAULT true,
    min_risk_level text DEFAULT 'high'::text,
    weekly_digest_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notification_settings_min_risk_level_check CHECK ((min_risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
);


--
-- Name: patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scan_id uuid NOT NULL,
    chat_id uuid NOT NULL,
    pattern_type text NOT NULL,
    description text,
    confidence numeric(3,2),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: scans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_id uuid NOT NULL,
    lookback_window text NOT NULL,
    status text DEFAULT 'pending'::text,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    duration_seconds integer,
    messages_analyzed integer DEFAULT 0,
    summary_json jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT scans_lookback_window_check CHECK ((lookback_window = ANY (ARRAY['24h'::text, '7d'::text, '30d'::text]))),
    CONSTRAINT scans_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: teacher_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_user_id uuid NOT NULL,
    finding_id uuid,
    child_id uuid NOT NULL,
    teacher_email text NOT NULL,
    teacher_name text,
    status text DEFAULT 'pending'::text NOT NULL,
    parent_message text,
    teacher_response text,
    responded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: chats chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_pkey PRIMARY KEY (id);


--
-- Name: children children_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.children
    ADD CONSTRAINT children_pkey PRIMARY KEY (id);


--
-- Name: connector_credentials connector_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_credentials
    ADD CONSTRAINT connector_credentials_pkey PRIMARY KEY (id);


--
-- Name: data_sources data_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_sources
    ADD CONSTRAINT data_sources_pkey PRIMARY KEY (id);


--
-- Name: evidence_items evidence_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_items
    ADD CONSTRAINT evidence_items_pkey PRIMARY KEY (id);


--
-- Name: findings findings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_pkey PRIMARY KEY (id);


--
-- Name: forum_messages forum_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_messages
    ADD CONSTRAINT forum_messages_pkey PRIMARY KEY (id);


--
-- Name: imports imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (id);


--
-- Name: notification_settings notification_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_user_id_key UNIQUE (user_id);


--
-- Name: patterns patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patterns
    ADD CONSTRAINT patterns_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: scans scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scans
    ADD CONSTRAINT scans_pkey PRIMARY KEY (id);


--
-- Name: teacher_alerts teacher_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_alerts
    ADD CONSTRAINT teacher_alerts_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_chats_child_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chats_child_id ON public.chats USING btree (child_id);


--
-- Name: idx_children_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_children_user_id ON public.children USING btree (user_id);


--
-- Name: idx_connector_credentials_child_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connector_credentials_child_id ON public.connector_credentials USING btree (child_id);


--
-- Name: idx_connector_credentials_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connector_credentials_status ON public.connector_credentials USING btree (status);


--
-- Name: idx_evidence_items_finding_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evidence_items_finding_id ON public.evidence_items USING btree (finding_id);


--
-- Name: idx_findings_child_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_findings_child_id ON public.findings USING btree (child_id);


--
-- Name: idx_findings_scan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_findings_scan_id ON public.findings USING btree (scan_id);


--
-- Name: idx_imports_child_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_imports_child_id ON public.imports USING btree (child_id);


--
-- Name: idx_messages_chat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_chat_id ON public.messages USING btree (chat_id);


--
-- Name: idx_messages_child_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_child_id ON public.messages USING btree (child_id);


--
-- Name: idx_messages_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_timestamp ON public.messages USING btree (message_timestamp);


--
-- Name: idx_patterns_scan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patterns_scan_id ON public.patterns USING btree (scan_id);


--
-- Name: idx_scans_child_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scans_child_id ON public.scans USING btree (child_id);


--
-- Name: children update_children_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_children_updated_at BEFORE UPDATE ON public.children FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: forum_messages update_forum_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_forum_messages_updated_at BEFORE UPDATE ON public.forum_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notification_settings update_notification_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_notification_settings_updated_at BEFORE UPDATE ON public.notification_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: teacher_alerts update_teacher_alerts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_teacher_alerts_updated_at BEFORE UPDATE ON public.teacher_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chats chats_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: chats chats_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.imports(id) ON DELETE SET NULL;


--
-- Name: children children_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.children
    ADD CONSTRAINT children_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: connector_credentials connector_credentials_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_credentials
    ADD CONSTRAINT connector_credentials_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: connector_credentials connector_credentials_data_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_credentials
    ADD CONSTRAINT connector_credentials_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES public.data_sources(id) ON DELETE CASCADE;


--
-- Name: data_sources data_sources_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_sources
    ADD CONSTRAINT data_sources_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: evidence_items evidence_items_finding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_items
    ADD CONSTRAINT evidence_items_finding_id_fkey FOREIGN KEY (finding_id) REFERENCES public.findings(id) ON DELETE CASCADE;


--
-- Name: evidence_items evidence_items_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_items
    ADD CONSTRAINT evidence_items_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: findings findings_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: findings findings_scan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_scan_id_fkey FOREIGN KEY (scan_id) REFERENCES public.scans(id) ON DELETE CASCADE;


--
-- Name: imports imports_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: messages messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;


--
-- Name: messages messages_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: notification_settings notification_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: patterns patterns_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patterns
    ADD CONSTRAINT patterns_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;


--
-- Name: patterns patterns_scan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patterns
    ADD CONSTRAINT patterns_scan_id_fkey FOREIGN KEY (scan_id) REFERENCES public.scans(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: scans scans_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scans
    ADD CONSTRAINT scans_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: teacher_alerts teacher_alerts_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_alerts
    ADD CONSTRAINT teacher_alerts_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: teacher_alerts teacher_alerts_finding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_alerts
    ADD CONSTRAINT teacher_alerts_finding_id_fkey FOREIGN KEY (finding_id) REFERENCES public.findings(id) ON DELETE CASCADE;


--
-- Name: teacher_alerts Parents can insert own teacher alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can insert own teacher alerts" ON public.teacher_alerts FOR INSERT WITH CHECK ((auth.uid() = parent_user_id));


--
-- Name: teacher_alerts Parents can update own teacher alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can update own teacher alerts" ON public.teacher_alerts FOR UPDATE USING ((auth.uid() = parent_user_id));


--
-- Name: teacher_alerts Parents can view own teacher alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view own teacher alerts" ON public.teacher_alerts FOR SELECT USING ((auth.uid() = parent_user_id));


--
-- Name: chats Users can delete own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own chats" ON public.chats FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = chats.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: children Users can delete own children; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own children" ON public.children FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: data_sources Users can delete own data sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own data sources" ON public.data_sources FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = data_sources.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: forum_messages Users can delete own forum messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own forum messages" ON public.forum_messages FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: messages Users can delete own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own messages" ON public.messages FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = messages.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: audit_logs Users can insert own audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own audit logs" ON public.audit_logs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: chats Users can insert own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own chats" ON public.chats FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = chats.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: children Users can insert own children; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own children" ON public.children FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: data_sources Users can insert own data sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own data sources" ON public.data_sources FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = data_sources.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: evidence_items Users can insert own evidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own evidence" ON public.evidence_items FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.findings f
     JOIN public.children c ON ((f.child_id = c.id)))
  WHERE ((f.id = evidence_items.finding_id) AND (c.user_id = auth.uid())))));


--
-- Name: findings Users can insert own findings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own findings" ON public.findings FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = findings.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: forum_messages Users can insert own forum messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own forum messages" ON public.forum_messages FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: imports Users can insert own imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own imports" ON public.imports FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = imports.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: messages Users can insert own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own messages" ON public.messages FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = messages.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: notification_settings Users can insert own notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own notification settings" ON public.notification_settings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: patterns Users can insert own patterns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own patterns" ON public.patterns FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.scans s
     JOIN public.children c ON ((s.child_id = c.id)))
  WHERE ((s.id = patterns.scan_id) AND (c.user_id = auth.uid())))));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: scans Users can insert own scans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own scans" ON public.scans FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = scans.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: connector_credentials Users can manage own connector credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own connector credentials" ON public.connector_credentials USING ((EXISTS ( SELECT 1
   FROM (public.data_sources ds
     JOIN public.children c ON ((ds.child_id = c.id)))
  WHERE ((ds.id = connector_credentials.data_source_id) AND (c.user_id = auth.uid())))));


--
-- Name: chats Users can update own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own chats" ON public.chats FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = chats.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: children Users can update own children; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own children" ON public.children FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: data_sources Users can update own data sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own data sources" ON public.data_sources FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = data_sources.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: findings Users can update own findings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own findings" ON public.findings FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = findings.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: forum_messages Users can update own forum messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own forum messages" ON public.forum_messages FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: imports Users can update own imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own imports" ON public.imports FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = imports.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: notification_settings Users can update own notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notification settings" ON public.notification_settings FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: scans Users can update own scans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own scans" ON public.scans FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = scans.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: forum_messages Users can view all forum messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all forum messages" ON public.forum_messages FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: audit_logs Users can view own audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own audit logs" ON public.audit_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chats Users can view own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own chats" ON public.chats FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = chats.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: children Users can view own children; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own children" ON public.children FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: data_sources Users can view own data sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own data sources" ON public.data_sources FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = data_sources.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: evidence_items Users can view own evidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own evidence" ON public.evidence_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.findings f
     JOIN public.children c ON ((f.child_id = c.id)))
  WHERE ((f.id = evidence_items.finding_id) AND (c.user_id = auth.uid())))));


--
-- Name: findings Users can view own findings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own findings" ON public.findings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = findings.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: imports Users can view own imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own imports" ON public.imports FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = imports.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: messages Users can view own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own messages" ON public.messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = messages.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: notification_settings Users can view own notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notification settings" ON public.notification_settings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: patterns Users can view own patterns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own patterns" ON public.patterns FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.scans s
     JOIN public.children c ON ((s.child_id = c.id)))
  WHERE ((s.id = patterns.scan_id) AND (c.user_id = auth.uid())))));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: scans Users can view own scans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own scans" ON public.scans FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.children
  WHERE ((children.id = scans.child_id) AND (children.user_id = auth.uid())))));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

--
-- Name: children; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

--
-- Name: connector_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connector_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: data_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: evidence_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;

--
-- Name: findings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: imports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: patterns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: scans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_alerts ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;