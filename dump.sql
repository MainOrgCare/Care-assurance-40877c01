--
-- PostgreSQL database dump
--

\restrict gpMzYN8hyaIOnTCuM9kHj1rV47orE1omdc8lvyinET8AKYfXJq29uJttNao3esJ

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

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

ALTER TABLE IF EXISTS ONLY public.suspension_logs DROP CONSTRAINT IF EXISTS suspension_logs_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.session_history DROP CONSTRAINT IF EXISTS session_history_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.emar_corrections DROP CONSTRAINT IF EXISTS emar_corrections_admin_id_fkey;
ALTER TABLE IF EXISTS ONLY public.discrepancies DROP CONSTRAINT IF EXISTS discrepancies_care_worker_id_care_workers_id_fk;
ALTER TABLE IF EXISTS ONLY public.admin_alerts DROP CONSTRAINT IF EXISTS admin_alerts_care_worker_id_care_workers_id_fk;
ALTER TABLE IF EXISTS ONLY public.active_sessions DROP CONSTRAINT IF EXISTS active_sessions_user_id_users_id_fk;
DROP INDEX IF EXISTS public."IDX_session_expire";
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_username_unique;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.system_logs DROP CONSTRAINT IF EXISTS system_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.suspension_logs DROP CONSTRAINT IF EXISTS suspension_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.session DROP CONSTRAINT IF EXISTS session_pkey;
ALTER TABLE IF EXISTS ONLY public.session_history DROP CONSTRAINT IF EXISTS session_history_pkey;
ALTER TABLE IF EXISTS ONLY public.risk_assessment_logs DROP CONSTRAINT IF EXISTS risk_assessment_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.policy_documents DROP CONSTRAINT IF EXISTS policy_documents_pkey;
ALTER TABLE IF EXISTS ONLY public.file_scan_logs DROP CONSTRAINT IF EXISTS file_scan_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.emar_refusal_reviews DROP CONSTRAINT IF EXISTS emar_refusal_reviews_pkey;
ALTER TABLE IF EXISTS ONLY public.emar_corrections DROP CONSTRAINT IF EXISTS emar_corrections_pkey;
ALTER TABLE IF EXISTS ONLY public.discrepancies DROP CONSTRAINT IF EXISTS discrepancies_pkey;
ALTER TABLE IF EXISTS ONLY public.care_workers DROP CONSTRAINT IF EXISTS care_workers_pkey;
ALTER TABLE IF EXISTS ONLY public.blocked_ips DROP CONSTRAINT IF EXISTS blocked_ips_pkey;
ALTER TABLE IF EXISTS ONLY public.blocked_ips DROP CONSTRAINT IF EXISTS blocked_ips_ip_address_unique;
ALTER TABLE IF EXISTS ONLY public.audits DROP CONSTRAINT IF EXISTS audits_pkey;
ALTER TABLE IF EXISTS ONLY public.ai_usage_logs DROP CONSTRAINT IF EXISTS ai_usage_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.admin_alerts DROP CONSTRAINT IF EXISTS admin_alerts_pkey;
ALTER TABLE IF EXISTS ONLY public.active_sessions DROP CONSTRAINT IF EXISTS active_sessions_pkey;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.system_logs;
DROP TABLE IF EXISTS public.suspension_logs;
DROP TABLE IF EXISTS public.session_history;
DROP TABLE IF EXISTS public.session;
DROP TABLE IF EXISTS public.risk_assessment_logs;
DROP TABLE IF EXISTS public.policy_documents;
DROP TABLE IF EXISTS public.file_scan_logs;
DROP TABLE IF EXISTS public.emar_refusal_reviews;
DROP TABLE IF EXISTS public.emar_corrections;
DROP TABLE IF EXISTS public.discrepancies;
DROP TABLE IF EXISTS public.care_workers;
DROP TABLE IF EXISTS public.blocked_ips;
DROP TABLE IF EXISTS public.audits;
DROP TABLE IF EXISTS public.ai_usage_logs;
DROP TABLE IF EXISTS public.admin_alerts;
DROP TABLE IF EXISTS public.active_sessions;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: active_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_sessions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    username text NOT NULL,
    role text NOT NULL,
    session_id text NOT NULL,
    ip_address text,
    city text,
    region text,
    country text,
    latitude text,
    longitude text,
    last_activity timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_alerts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    care_worker_id character varying NOT NULL,
    care_worker_name text NOT NULL,
    message text NOT NULL,
    discrepancy_type text NOT NULL,
    discrepancy_count integer NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    feature text NOT NULL,
    model text NOT NULL,
    input_tokens integer NOT NULL,
    output_tokens integer NOT NULL,
    total_tokens integer NOT NULL,
    cost_micros integer NOT NULL,
    billing_source text NOT NULL,
    user_id character varying,
    duration_ms integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    provider text DEFAULT 'replit'::text NOT NULL,
    username text
);


--
-- Name: audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audits (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    service_user_name text NOT NULL,
    auditor text NOT NULL,
    audit_type text NOT NULL,
    period_start text NOT NULL,
    period_end text NOT NULL,
    results jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: blocked_ips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_ips (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    ip_address text NOT NULL,
    blocked_by text NOT NULL,
    reason text,
    username text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: care_workers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.care_workers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: discrepancies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discrepancies (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    care_worker_id character varying NOT NULL,
    type text NOT NULL,
    date text NOT NULL,
    description text NOT NULL,
    action text NOT NULL,
    severity text,
    action_medium text,
    manager text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: emar_corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emar_corrections (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    audit_id character varying,
    admin_id character varying NOT NULL,
    admin_username text NOT NULL,
    service_user_initials text,
    original_medication text NOT NULL,
    original_date text NOT NULL,
    original_time_slot text,
    original_code text,
    original_care_worker text,
    corrected_medication text,
    corrected_date text,
    corrected_time_slot text,
    corrected_code text,
    corrected_care_worker text,
    correction_note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: emar_refusal_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emar_refusal_reviews (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    audit_id character varying,
    care_worker_name text NOT NULL,
    medication text NOT NULL,
    refusal_date text NOT NULL,
    time_slot text,
    reason_acceptable boolean DEFAULT false NOT NULL,
    reviewer_notes text,
    reviewed_by text NOT NULL,
    reviewed_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: file_scan_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_scan_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    file_name text NOT NULL,
    file_hash text NOT NULL,
    file_size integer NOT NULL,
    scan_result text NOT NULL,
    threats_found text,
    scanned_by text,
    upload_type text,
    cached_result boolean DEFAULT false,
    scanned_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: policy_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_documents (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    content text NOT NULL,
    keywords text[],
    version text,
    last_updated timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: risk_assessment_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_assessment_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    service_user_initials text NOT NULL,
    performed_by text NOT NULL,
    performed_by_job_title text,
    offered_assessments jsonb NOT NULL,
    selected_assessments jsonb NOT NULL,
    skipped_mandatory jsonb NOT NULL,
    document_summary text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: session_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_history (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    username text NOT NULL,
    session_id text NOT NULL,
    ip_address text,
    city text,
    country text,
    logged_in_at timestamp without time zone DEFAULT now() NOT NULL,
    logged_out_at timestamp without time zone,
    duration_seconds integer,
    terminated_by_admin boolean DEFAULT false
);


--
-- Name: suspension_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suspension_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    username text NOT NULL,
    admin_id character varying NOT NULL,
    admin_username text NOT NULL,
    duration_minutes integer NOT NULL,
    reason text,
    starts_at timestamp without time zone DEFAULT now() NOT NULL,
    ends_at timestamp without time zone NOT NULL,
    reinstated_early boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: system_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    user_id character varying,
    username text,
    details jsonb,
    service_user_initials text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    first_name text,
    last_name text,
    password text NOT NULL,
    role text DEFAULT 'staff'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    job_title text,
    suspended_until timestamp without time zone,
    last_online_at timestamp without time zone,
    dashboard_widgets jsonb,
    terms_accepted_at timestamp without time zone,
    terms_version text,
    terms_signature_name text,
    terms_signature_date text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Data for Name: active_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.active_sessions (id, user_id, username, role, session_id, ip_address, city, region, country, latitude, longitude, last_activity, created_at) FROM stdin;
f33de13d-0c5d-4cba-944c-e304ec3b3dfa	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	admin	pUIijY7LOrdERJEJe5TkCyXfy0tTJ8Bg	86.31.251.20	\N	\N	\N	\N	\N	2026-01-03 03:11:03.711	2026-01-03 03:10:47.281364
\.


--
-- Data for Name: admin_alerts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admin_alerts (id, care_worker_id, care_worker_name, message, discrepancy_type, discrepancy_count, is_read, created_at) FROM stdin;
\.


--
-- Data for Name: ai_usage_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ai_usage_logs (id, feature, model, input_tokens, output_tokens, total_tokens, cost_micros, billing_source, user_id, duration_ms, created_at, provider, username) FROM stdin;
d6043bb5-5fc8-4359-ad23-94aed48efae2	emar_metadata	gpt-5.1	2929	1390	4319	35495	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	6731	2025-12-30 09:50:17.034938	replit	Lewis.barron
b312b7d9-a154-4462-abad-46f8439b8e7b	drug_interactions	gpt-5.1	343	363	706	7160	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	2758	2025-12-30 09:50:19.793959	replit	Lewis.barron
b9a76432-6bb2-4055-b131-bcd5d3262ab3	emar_count_validation	gpt-5.1	2189	16	2205	11185	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	643	2025-12-30 09:50:20.440094	replit	Lewis.barron
bf8ce378-25c8-4fda-b6d7-43fc6ead9483	emar_count_validation	gpt-5.1	2189	16	2205	11185	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	532	2025-12-30 09:50:20.99109	replit	Lewis.barron
66fc3f96-d082-4313-9cf2-41983df8a28e	emar_extraction	gpt-5.1	3028	1368	4396	35660	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	5939	2025-12-30 09:50:26.90977	replit	Lewis.barron
4856d84a-ddac-462d-adcc-0c80bc2c461f	emar_extraction	gpt-5.1	3028	1368	4396	35660	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	5995	2025-12-30 09:50:26.965614	replit	Lewis.barron
20a720ce-1c91-44b4-9e9a-6a23225d8b4a	emar_extraction	gpt-5.1	3031	1365	4396	35630	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	6311	2025-12-30 09:50:27.281909	replit	Lewis.barron
1ea305d9-ec84-487f-9c39-01a0a4890ac6	emar_extraction	gpt-5.1	3031	1365	4396	35630	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	6365	2025-12-30 09:50:27.335806	replit	Lewis.barron
cb858305-1347-40f2-bfb8-de7115629592	emar_extraction	gpt-5.1	3028	1368	4396	35660	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	6552	2025-12-30 09:50:27.522889	replit	Lewis.barron
4b4f337d-13a2-403b-8a97-3f5c20bcd736	emar_extraction	gpt-5.1	3010	1646	4656	39740	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	6657	2025-12-30 09:50:27.627984	replit	Lewis.barron
d0b1ef66-e2bd-420b-a5c9-0c9b4862cd0f	emar_extraction	gpt-5.1	3031	1365	4396	35630	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	6715	2025-12-30 09:50:27.685341	replit	Lewis.barron
4073e0c4-9714-4a31-9ffc-dcc9dd2e0b10	emar_extraction	gpt-5.1	3010	1646	4656	39740	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	8848	2025-12-30 09:50:29.818155	replit	Lewis.barron
fba92cdd-0bc5-4616-a827-d2479d598007	emar_extraction	gpt-5.1	3010	1646	4656	39740	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	8914	2025-12-30 09:50:29.884066	replit	Lewis.barron
d6341794-47ab-4017-bf09-ec7324bf1f48	emar_extraction	gpt-5.1	3024	2286	5310	49410	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	9937	2025-12-30 09:50:30.90763	replit	Lewis.barron
c5e881b2-c1c1-4bd2-817e-44c9921d6d66	emar_extraction	gpt-5.1	3024	2779	5803	56805	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	12257	2025-12-30 09:50:33.227516	replit	Lewis.barron
dfbffb2e-9e61-45e9-825a-cd4adb30fea5	emar_extraction	gpt-5.1	3024	2712	5736	55800	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	13017	2025-12-30 09:50:33.987534	replit	Lewis.barron
c1000fb0-6d31-48af-aa6c-4c95e9c1a992	emar_extraction	gpt-5.1	3022	3987	7009	74915	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	15804	2025-12-30 09:50:36.775453	replit	Lewis.barron
a7fe38b7-1ca7-4808-8eb3-5bff49549971	emar_extraction	gpt-5.1	3022	3987	7009	74915	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	15935	2025-12-30 09:50:36.907982	replit	Lewis.barron
5ac06862-c17c-46ff-92d1-ce6f5cbac8d2	emar_extraction	gpt-5.1	3022	3987	7009	74915	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	16398	2025-12-30 09:50:37.373852	replit	Lewis.barron
4e7aac54-c9f1-4e4b-8e3e-b7f180040e91	emar_equivalence	gpt-5.1	353	98	451	3235	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	1280	2025-12-30 09:50:38.697172	replit	Lewis.barron
559d8fdf-dd6d-4126-ad6a-9057c606ea94	emar_validation_pass2	gpt-5.1	4206	100	4306	22530	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	996	2025-12-30 09:50:39.693883	replit	Lewis.barron
7905af29-e74d-46d1-bdac-24130e9fce27	emar_validation_pass3	gpt-5.1	4173	2000	6173	50865	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	11796	2025-12-30 09:50:51.499411	replit	Lewis.barron
e23ed7c1-890b-47af-9f91-1f4abfc15a9d	emar_metadata	gpt-5.1	2977	1388	4365	35705	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	5980	2026-01-01 02:53:15.991906	replit	Lewis.barron
1e2f9337-6e62-4023-8606-ab38dad740f4	drug_interactions	gpt-5.1	313	165	478	4040	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	1536	2026-01-01 02:53:17.529288	replit	Lewis.barron
b428eb17-02d9-4984-99aa-c2b4d95b3ef4	emar_count_validation	gpt-5.1	2189	16	2205	11185	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	543	2026-01-01 02:53:18.075285	replit	Lewis.barron
96b9d4d6-29c8-4803-a8c4-d9f2e54e8c2f	emar_count_validation	gpt-5.1	2189	16	2205	11185	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	815	2026-01-01 02:53:18.906508	replit	Lewis.barron
4033654c-fa14-421e-9e8f-0d9dc8ba2adf	emar_extraction	gpt-5.1	3022	1365	4387	35585	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	5737	2026-01-01 02:53:24.62537	replit	Lewis.barron
0cfa6375-f387-4b12-8a59-1a7f1e54b5a3	emar_extraction	gpt-5.1	3016	1368	4384	35600	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	5781	2026-01-01 02:53:24.669165	replit	Lewis.barron
40b3984c-6133-4cfa-af39-11d2f29ef09b	emar_extraction	gpt-5.1	3016	1368	4384	35600	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	5816	2026-01-01 02:53:24.70583	replit	Lewis.barron
959f581e-7438-4349-a257-d98943e03455	emar_extraction	gpt-5.1	3016	1368	4384	35600	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	5978	2026-01-01 02:53:24.86703	replit	Lewis.barron
906ddb37-3f7e-45bd-8dec-ac173eb6a393	emar_extraction	gpt-5.1	3022	1433	4455	36605	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	6060	2026-01-01 02:53:24.950055	replit	Lewis.barron
6e6ab0b7-ed55-450b-9ce0-730358395521	emar_extraction	gpt-5.1	3022	1365	4387	35585	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	6067	2026-01-01 02:53:24.95572	replit	Lewis.barron
beb89758-29a6-44d7-93fd-a8138991f9f7	emar_extraction	gpt-5.1	3010	1646	4656	39740	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	7001	2026-01-01 02:53:25.890397	replit	Lewis.barron
52342cf4-d4fe-416c-a455-cafe7468f200	emar_extraction	gpt-5.1	3010	1646	4656	39740	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	7032	2026-01-01 02:53:25.921226	replit	Lewis.barron
86ae3da1-5433-499a-937d-c9e97f0e367d	emar_extraction	gpt-5.1	3010	1646	4656	39740	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	7117	2026-01-01 02:53:26.006335	replit	Lewis.barron
0a8cc562-82fd-4473-9d6f-1bccfa644cb2	emar_extraction	gpt-5.1	3018	2712	5730	55770	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	10305	2026-01-01 02:53:29.194158	replit	Lewis.barron
833bfb55-7733-4a37-8666-93392120e7f3	emar_extraction	gpt-5.1	3018	2712	5730	55770	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	10497	2026-01-01 02:53:29.385069	replit	Lewis.barron
e08cf523-b014-4e11-947c-293e36126022	emar_extraction	gpt-5.1	3018	2712	5730	55770	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	10543	2026-01-01 02:53:29.432514	replit	Lewis.barron
15665b42-fb19-4fd9-b9be-43ebce8aac4f	emar_extraction	gpt-5.1	3022	3987	7009	74915	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	14465	2026-01-01 02:53:33.354377	replit	Lewis.barron
d8adfe48-2d17-4672-9379-5566abfdc708	emar_extraction	gpt-5.1	3022	3987	7009	74915	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	14467	2026-01-01 02:53:33.366108	replit	Lewis.barron
22915d91-b611-4939-842f-dafa840462cb	emar_extraction	gpt-5.1	3022	3987	7009	74915	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	14500	2026-01-01 02:53:33.393712	replit	Lewis.barron
4a703870-73e3-4a14-b0cc-e13b4477e7fc	emar_equivalence	gpt-5.1	332	98	430	3130	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	1000	2026-01-01 02:53:34.412401	replit	Lewis.barron
917e195a-bcde-4f3d-9d64-1a3faabb86ce	emar_validation_pass2	gpt-5.1	5693	156	5849	30805	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	1461	2026-01-01 02:53:35.873019	replit	Lewis.barron
8041b596-324d-4291-a30c-7e82042c7126	emar_validation_pass3	gpt-5.1	5433	2000	7433	57165	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	11349	2026-01-01 02:53:47.232208	replit	Lewis.barron
22bc2508-c1d2-40d4-a67a-033aea436e33	emar_metadata	gpt-5.1	1474	482	1956	14600	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	5644	2026-01-02 23:14:00.325471	openai	Lewis.barron
78398453-11f6-40c2-8d51-d0c274e30dfe	drug_interactions	gpt-5.1	222	15	237	1335	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	1604	2026-01-02 23:14:01.928999	openai	Lewis.barron
fa16f072-50f0-4fcc-8210-9efb2c53ec11	emar_count_validation	gpt-5.1	781	15	796	4130	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	1836	2026-01-02 23:14:03.774823	openai	Lewis.barron
4b5b2031-a712-4b5f-a484-1a66618220cb	emar_extraction	gpt-5.1	1579	1010	2589	23045	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	5885	2026-01-02 23:14:09.65161	openai	Lewis.barron
4cfbfd9f-7ae5-4405-a9c7-79282ef8f7bd	emar_extraction	gpt-5.1	1579	1010	2589	23045	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	6518	2026-01-02 23:14:10.284724	openai	Lewis.barron
b7c734fe-534f-4ae1-b257-f21a68b5851e	emar_extraction	gpt-5.1	1579	1010	2589	23045	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	6600	2026-01-02 23:14:10.364835	openai	Lewis.barron
498a2aa8-43e4-43e1-aa67-e71971fce342	emar_extraction	gpt-5.1	1616	1498	3114	30550	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	7900	2026-01-02 23:14:11.665904	openai	Lewis.barron
886c83cd-7e36-472d-956c-bdd58cbe489b	emar_extraction	gpt-5.1	1616	1498	3114	30550	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	8330	2026-01-02 23:14:12.094834	openai	Lewis.barron
00adf670-a93b-42fc-8234-f1d1635495e3	emar_extraction	gpt-5.1	1616	1854	3470	35890	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	10609	2026-01-02 23:14:14.382804	openai	Lewis.barron
dafb7a62-7b19-4f12-9c44-80f574c7212b	emar_equivalence	gpt-5.1	293	16	309	1705	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	1212	2026-01-02 23:14:15.619138	openai	Lewis.barron
364d9b06-1ed8-4797-bfe1-30e59f47a06e	emar_validation_pass2	gpt-5.1	1116	25	1141	5955	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	1747	2026-01-02 23:14:17.367567	openai	Lewis.barron
7b0e0bd9-83c1-4b90-9c69-d385e30fa3c9	emar_validation_pass3	gpt-5.1	1083	433	1516	11910	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	4773	2026-01-02 23:14:22.140177	openai	Lewis.barron
5ebefebf-644c-47fa-bed3-1b859b443bc0	emar_metadata	gpt-5.1	1474	483	1957	14615	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	2812	2026-01-02 23:39:45.689323	replit	Lewis.barron
85f968cc-3313-4fec-99ef-0a5a72418ade	drug_interactions	gpt-5.1	222	16	238	1350	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	711	2026-01-02 23:39:46.400841	replit	Lewis.barron
27922f63-9375-43c4-9043-ea0383e6a053	emar_count_validation	gpt-5.1	781	16	797	4145	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	914	2026-01-02 23:39:47.321001	replit	Lewis.barron
6976d8b8-3e3c-484a-a6bb-fab907b94bd8	emar_extraction	gpt-5.1	1579	1011	2590	23060	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	4789	2026-01-02 23:39:52.103715	replit	Lewis.barron
1ebe4185-ac94-44de-9038-75f373da77bf	emar_extraction	gpt-5.1	1579	1011	2590	23060	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	5328	2026-01-02 23:39:52.642408	replit	Lewis.barron
d7751c99-b765-4e2c-8446-98d62cd8bb53	emar_extraction	gpt-5.1	1616	1357	2973	28435	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	5463	2026-01-02 23:39:52.777776	replit	Lewis.barron
1583dcd0-e66f-406b-a13f-0134923252a0	emar_extraction	gpt-5.1	1579	1011	2590	23060	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	5489	2026-01-02 23:39:52.80364	replit	Lewis.barron
37c61f54-ca08-4bdb-b89c-5df7196373cc	emar_extraction	gpt-5.1	1616	1357	2973	28435	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	5671	2026-01-02 23:39:52.986145	replit	Lewis.barron
e0334125-2174-4f84-828a-7e9707a417be	emar_extraction	gpt-5.1	1616	1499	3115	30565	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	6376	2026-01-02 23:39:53.693357	replit	Lewis.barron
6b4a9d91-a5af-4b0d-9206-146112c3bf9f	emar_equivalence	gpt-5.1	293	17	310	1720	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	820	2026-01-02 23:39:54.532359	replit	Lewis.barron
4f0c7cfa-24a3-4100-8ec8-4be18633a98b	emar_validation_pass2	gpt-5.1	1084	23	1107	5765	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	993	2026-01-02 23:39:55.528117	replit	Lewis.barron
bd0fbe52-0e95-4b0a-a44b-6d8568dda729	emar_validation_pass3	gpt-5.1	1051	289	1340	9590	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	2355	2026-01-02 23:39:57.882293	replit	Lewis.barron
9d1b46d8-b23a-463e-9eda-de9e01f1ba7e	emar_metadata	gpt-5.1	1474	482	1956	14600	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	3218	2026-01-02 23:41:56.267625	openai	Lewis.barron
29093778-768a-4fa7-b7cb-2c12ae46c570	drug_interactions	gpt-5.1	222	15	237	1335	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	1577	2026-01-02 23:41:57.847929	openai	Lewis.barron
d74b2efb-2a51-460f-b165-baadd1f5ea48	emar_count_validation	gpt-5.1	781	15	796	4130	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	1054	2026-01-02 23:41:58.911541	openai	Lewis.barron
9dd34662-f150-4b14-9f62-e3c0dd860957	emar_extraction	gpt-5.1	1579	1010	2589	23045	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	5872	2026-01-02 23:42:04.774255	openai	Lewis.barron
a9a2c329-db82-438e-818d-c7052fa93668	emar_extraction	gpt-5.1	1579	1010	2589	23045	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	6241	2026-01-02 23:42:05.143001	openai	Lewis.barron
6853cba6-4910-4ddb-97da-416485360c73	emar_extraction	gpt-5.1	1579	1010	2589	23045	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	6667	2026-01-02 23:42:05.568971	openai	Lewis.barron
2de0afbd-5256-4800-88e3-5146a5156f1f	emar_extraction	gpt-5.1	1616	1498	3114	30550	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	10293	2026-01-02 23:42:09.194259	openai	Lewis.barron
f70e71fc-c33f-4787-9b26-c605ad77b46b	emar_extraction	gpt-5.1	1616	1498	3114	30550	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	10346	2026-01-02 23:42:09.247379	openai	Lewis.barron
7a1d7b6f-252f-4097-8a56-7ea1ecc4741f	emar_extraction	gpt-5.1	1616	1854	3470	35890	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	11622	2026-01-02 23:42:10.524824	openai	Lewis.barron
dbaef74a-9732-4bf9-976a-c3f8b7338ae9	emar_equivalence	gpt-5.1	293	16	309	1705	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	961	2026-01-02 23:42:11.505852	openai	Lewis.barron
b9d14ccc-a338-416a-909e-0ec1f197c444	emar_validation_pass2	gpt-5.1	1116	25	1141	5955	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	1135	2026-01-02 23:42:12.642257	openai	Lewis.barron
0746dc8c-2463-4a83-b386-b6e72278ff93	emar_validation_pass3	gpt-5.1	1083	513	1596	13110	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	3932	2026-01-02 23:42:16.57602	openai	Lewis.barron
873894f2-4311-4f76-bd42-55b88c679a46	emar_metadata	gpt-5.1	1474	482	1956	14600	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	3285	2026-01-02 23:44:26.934822	openai	Lewis.barron
a3bead2b-f99f-4726-b767-901a3316ca23	drug_interactions	gpt-5.1	222	15	237	1335	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	1090	2026-01-02 23:44:28.025235	openai	Lewis.barron
c4ac1876-dcf6-4794-bb07-15837563eada	emar_count_validation	gpt-5.1	781	15	796	4130	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	1148	2026-01-02 23:44:29.185183	openai	Lewis.barron
4c2f566f-edd5-4e75-8fb6-ddeaaac1bdc4	emar_extraction	gpt-5.1	1579	1010	2589	23045	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	6076	2026-01-02 23:44:35.24961	openai	Lewis.barron
6384270f-0031-4d33-bdd7-e408f7332caf	emar_extraction	gpt-5.1	1579	1010	2589	23045	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	6304	2026-01-02 23:44:35.47786	openai	Lewis.barron
7fa37d04-b24e-40a5-a769-0b00dc6bb037	emar_extraction	gpt-5.1	1579	1010	2589	23045	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	6365	2026-01-02 23:44:35.538511	openai	Lewis.barron
532225c1-938d-49ff-8287-c9cc0e2a1e6c	emar_extraction	gpt-5.1	1616	1498	3114	30550	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	8431	2026-01-02 23:44:37.604972	openai	Lewis.barron
6eb77cf4-bcf6-4201-b651-c2b0898422f0	emar_extraction	gpt-5.1	1616	1498	3114	30550	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	8833	2026-01-02 23:44:38.007384	openai	Lewis.barron
7d1b6d49-02a6-4548-9ff7-bf3a782e01e0	emar_extraction	gpt-5.1	1616	1854	3470	35890	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	10352	2026-01-02 23:44:39.538126	openai	Lewis.barron
7a4847c8-ebb6-4b99-bdce-5963478f85f6	emar_equivalence	gpt-5.1	293	16	309	1705	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	657	2026-01-02 23:44:40.231407	openai	Lewis.barron
6455a26b-732c-4f16-a6f8-aa7874a15afb	emar_validation_pass2	gpt-5.1	1116	25	1141	5955	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	712	2026-01-02 23:44:40.943553	openai	Lewis.barron
88bc4bae-4be3-44c1-9f05-264581f64b89	emar_validation_pass3	gpt-5.1	1083	370	1453	10965	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	2861	2026-01-02 23:44:43.806307	openai	Lewis.barron
57f46d39-c170-439a-bff6-7598b527f565	emar_metadata	gpt-5-mini	0	0	0	0	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	584	2026-01-03 02:11:32.30386	replit	Lewis.barron
934fbc65-2927-4db7-9e17-d69e7b3f4b8f	emar_metadata	gpt-4o	1475	441	1916	8098	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	4230	2026-01-03 02:18:51.779534	openai	Lewis.barron
473285f0-f0eb-42f0-a786-6840bdd88921	drug_interactions	gpt-4o	228	6	234	630	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	788	2026-01-03 02:18:52.567596	openai	Lewis.barron
e41ce2a2-8eae-4383-9179-e1bc24138f63	emar_count_validation	gpt-4o	782	6	788	2015	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	495	2026-01-03 02:18:53.090402	openai	Lewis.barron
7931b035-3b54-43f0-851c-08ac71d008f7	emar_extraction	gpt-4o	1617	1101	2718	15053	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	5598	2026-01-03 02:18:58.676897	openai	Lewis.barron
9670a2ea-e5e1-4ede-97c4-3f81c959962a	emar_extraction	gpt-4o	1580	803	2383	11980	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	5615	2026-01-03 02:18:58.689162	openai	Lewis.barron
b7a8180a-e2d7-46d6-9466-535ae81454fa	emar_extraction	gpt-4o	1617	1106	2723	15103	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	5697	2026-01-03 02:18:58.769625	openai	Lewis.barron
4538b302-b751-4da1-b333-656afab2b118	emar_extraction	gpt-4o	1580	803	2383	11980	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	6117	2026-01-03 02:18:59.1885	openai	Lewis.barron
ca92dbb3-a8ed-49bb-9248-a5cbe4c856af	emar_extraction	gpt-4o	1580	803	2383	11980	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	6272	2026-01-03 02:18:59.3486	openai	Lewis.barron
3ba54ac5-a272-47aa-a1bf-05d958dd5607	emar_extraction	gpt-4o	1617	1105	2722	15093	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	6343	2026-01-03 02:18:59.421003	openai	Lewis.barron
1d939270-03ca-421b-a2f4-a1394196d159	emar_equivalence	gpt-4o	294	9	303	825	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	826	2026-01-03 02:19:00.298281	openai	Lewis.barron
f338f9bd-9556-49f3-863d-446d27747f09	emar_validation_pass2	gpt-4o	970	7	977	2495	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	406	2026-01-03 02:19:00.706305	openai	Lewis.barron
ec3d7b88-37b0-40aa-9373-e96accda1ec3	emar_validation_pass3	gpt-4o	937	37	974	2713	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	787	2026-01-03 02:19:01.493851	openai	Lewis.barron
06002bb6-0321-4aea-97db-478ebdcc632b	emar_metadata	gpt-5.1	1474	525	1999	15245	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	2726	2026-01-03 02:19:55.333431	openai	Lewis.barron
3f4082b9-f140-444e-addd-e469e95c0603	drug_interactions	gpt-5.1	222	15	237	1335	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	615	2026-01-03 02:19:55.951471	openai	Lewis.barron
6bb7c3cc-cb0c-458e-bff0-21ba508e9818	emar_count_validation	gpt-5.1	781	15	796	4130	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	723	2026-01-03 02:19:56.681713	openai	Lewis.barron
159e4e2f-fc4f-42a2-adcf-d903f9d5c4ec	emar_extraction	gpt-5.1	1621	1010	2631	23255	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	4971	2026-01-03 02:20:01.644436	openai	Lewis.barron
9d75ac5e-81a7-461c-96b8-e1983713d483	emar_extraction	gpt-5.1	1621	1010	2631	23255	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	5085	2026-01-03 02:20:01.758524	openai	Lewis.barron
ae46aaa7-c3a5-4043-bb38-c47a9b04da04	emar_extraction	gpt-5.1	1658	1142	2800	25420	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	6348	2026-01-03 02:20:03.022825	openai	Lewis.barron
8231d13f-8295-472c-976d-278bf52d8575	emar_extraction	gpt-5.1	1658	1142	2800	25420	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	6518	2026-01-03 02:20:03.191642	openai	Lewis.barron
b944dbed-b662-4807-9ce8-640789b37b97	emar_extraction	gpt-5.1	1658	1498	3156	30760	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	7844	2026-01-03 02:20:04.516881	openai	Lewis.barron
bb822068-956d-48b7-9280-820b74364fc0	emar_extraction	gpt-5.1	1621	1010	2631	23255	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	9920	2026-01-03 02:20:06.597676	openai	Lewis.barron
af3e0062-bcc9-4331-af46-cc73aa87ec3d	emar_equivalence	gpt-5.1	293	16	309	1705	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	1096	2026-01-03 02:20:07.711748	openai	Lewis.barron
f347c960-754e-419e-bbe1-a628affec8bd	emar_validation_pass2	gpt-5.1	1084	22	1106	5750	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	519	2026-01-03 02:20:08.231318	openai	Lewis.barron
f1ed6391-4d45-4e41-84fa-7a5cf7847e5d	emar_validation_pass3	gpt-5.1	1051	388	1439	11075	openai	a88120ca-90b7-446a-a1c1-769d3760c9a7	3337	2026-01-03 02:20:11.570075	openai	Lewis.barron
1af36f34-c859-41f0-bfc8-707a04a39fb0	emar_metadata	gpt-5.1	1474	503	1977	14915	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	3399	2026-01-03 03:11:08.586397	replit	Lewis.barron
8a0a0b79-8941-4118-93dd-0131dfa158ad	drug_interactions	gpt-5.1	222	16	238	1350	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	672	2026-01-03 03:11:09.25622	replit	Lewis.barron
01b24d8f-28a9-4f96-a848-6986245e1dba	emar_count_validation	gpt-5.1	781	16	797	4145	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	867	2026-01-03 03:11:10.128972	replit	Lewis.barron
994c8373-4245-446e-a657-dcd2244c23e5	emar_extraction	gpt-5.1	1579	1011	2590	23060	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	4644	2026-01-03 03:11:14.767126	replit	Lewis.barron
4edc4e3c-0fa4-4b00-adb1-10628fd038b8	emar_extraction	gpt-5.1	1579	1011	2590	23060	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	4842	2026-01-03 03:11:14.965348	replit	Lewis.barron
6c7c603e-3ae0-41f0-845c-20acd88ca7a7	emar_extraction	gpt-5.1	1579	1011	2590	23060	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	5069	2026-01-03 03:11:15.192642	replit	Lewis.barron
3ba3ea71-2cb7-4c90-88bc-4ec369b514eb	emar_extraction	gpt-5.1	1616	1499	3115	30565	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	6491	2026-01-03 03:11:16.614792	replit	Lewis.barron
cd2038e2-2e2b-494b-b573-736fd0ca108a	emar_extraction	gpt-5.1	1616	1499	3115	30565	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	6518	2026-01-03 03:11:16.641374	replit	Lewis.barron
0c4b031e-b3f3-4d62-8ed7-43b5ba68ffae	emar_extraction	gpt-5.1	1616	1499	3115	30565	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	6635	2026-01-03 03:11:16.763655	replit	Lewis.barron
3c602fae-10c0-495c-b6c8-d84e2e405778	emar_equivalence	gpt-5.1	293	17	310	1720	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	1005	2026-01-03 03:11:17.794033	replit	Lewis.barron
ba0b104a-3a7a-4d34-a520-f0995261ea27	emar_validation_pass2	gpt-5.1	1116	26	1142	5970	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	892	2026-01-03 03:11:18.687693	replit	Lewis.barron
d363bbec-f343-4d5e-98f8-0ee3f4ab4823	emar_validation_pass3	gpt-5.1	1083	360	1443	10815	replit	a88120ca-90b7-446a-a1c1-769d3760c9a7	2678	2026-01-03 03:11:21.368089	replit	Lewis.barron
\.


--
-- Data for Name: audits; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audits (id, service_user_name, auditor, audit_type, period_start, period_end, results, created_at) FROM stdin;
e9f77e06-5431-495f-82c7-669105a7f6aa	M.S.	Lewis.barron	EMAR	Sun, 14 Dec	Sat, 20 Dec	{"warnings": [], "allergies": "None known at present time", "datesAudited": ["Sun, 14 Dec", "Mon, 15 Dec", "Tue, 16 Dec", "Wed, 17 Dec", "Thu, 18 Dec", "Fri, 19 Dec", "Sat, 20 Dec"], "discrepancies": [{"date": "Sun, 14 Dec", "issue": "Medication time gap violation: Only 1.2 hours between doses (required: 4 hours minimum). Previous dose at 16:41, this dose at 17:55", "actions": {"meeting": "in_person", "referToManager": true, "performanceNote": true}, "severity": "high", "timeSlot": "18:00-18:22", "medication": "Donepezil 10mg", "careWorkerName": "EA"}, {"date": "Sun, 14 Dec", "issue": "Medication time gap violation: Only 1.2 hours between doses (required: 4 hours minimum). Previous dose at 16:42, this dose at 17:55", "actions": {"meeting": "in_person", "referToManager": true, "performanceNote": true}, "severity": "high", "timeSlot": "18:00-18:22", "medication": "Metformin 5ml", "careWorkerName": "EA"}], "auditPeriodEnd": "Sat, 20 Dec", "countAgreement": false, "prnMedications": {"hasPRN": false, "medications": []}, "timeSlotsFound": ["09:00-09:22", "18:00-18:22", "19:30-19:52"], "countValidation": {"match": false, "agreedCount": 0, "extractedCount": 38, "agreedMedicationCount": 4, "extractedMedicationCount": 4, "medicationCountConsensus": true, "perMedicationActualCounts": {"1": 12, "2": 8, "3": 6, "4": 12}, "perMedicationExpectedCounts": {}}, "gapsInKnowledge": "Training needed on: documenting refusal reasons, documentation", "groupedRefusals": [{"code": "R", "count": 2, "dates": [{"code": "R", "date": "Wed, 17 Dec", "timeSlot": "19:30-19:52"}, {"code": "R", "date": "Fri, 19 Dec", "timeSlot": "19:30-19:52"}], "medication": "Seretide inhaler 250", "careWorkerName": "JM"}], "serviceUserName": "M.S.", "serviceUserType": "administer", "themesAndTrends": "Processed 38 entries across 4 medications for 7 days. 3-pass Vision consensus validation: 4 initial findings -> 4 confirmed discrepancies, 7 items requiring verification, and 0 warnings.", "auditPeriodStart": "Sun, 14 Dec", "drugInteractions": [], "extractionMethod": "vision-api", "hasDiscrepancies": true, "totalMedications": 4, "validationPasses": 3, "validationStatus": "completed", "totalRefusalCount": 2, "actualEntriesCount": 38, "addedDiscrepancies": [], "expectedEntryCount": 0, "groupedPrnRefusals": [], "prnProtocolResults": [], "validationEvidence": {"1": "For Seretide inhaler 250, evening slot 19:30–19:52 on Wed, 17 Dec shows entry: \\"JM\\tR\\" in the Seretide row, and the key defines \\"R - Refused\\". No reason is documented next to this refusal.", "2": "For Seretide inhaler 250, evening slot 19:30–19:52 on Fri, 19 Dec shows entry: \\"JM\\tR\\" in the Seretide row, and the key defines \\"R - Refused\\". No reason is documented next to this refusal.", "3": "Donepezil 10mg is listed as \\"Take ONE pm\\" with route oral. Under the 18:00–18:22 time band, Sun, 14 Dec shows \\"24916 EA 17:55\\tAD\\" (administered). Under the 19:30–19:52 time band, Sun, 14 Dec shows \\"24915 KW 16:41\\tAD\\" (administered). These two documented administrations on the same date are at 16:41 and 17:55, a gap of approximately 1.2 hours, which is less than the required 4 hours.", "4": "Metformin 5ml is prescribed as \\"Take 2 5ml spoons in morning and evening time\\". Under the 18:00–18:22 time band, Sun, 14 Dec shows \\"24916 EA 17:55\\tAD\\" (administered). Under the 19:30–19:52 time band, Sun, 14 Dec shows \\"24915 KW 16:42\\tAD\\" (administered). These two documented administrations on the same date are at 16:42 and 17:55, a gap of approximately 1.2 hours, which is less than the required 4 hours."}, "codeConflictDetails": "", "extractionConsensus": {"status": "no_consensus", "pass1Count": 34, "pass2Count": 31, "pass3Count": 31, "description": "No consensus - using pass 1 with highest count for safety", "matchingPasses": [1, 2, 3], "escalationReason": "Merged pass 1 (34) + 4 other + 0 single + 1 refusal overrides = 38 total (consensus: 91%)", "fallbackPassUsed": 1}, "groupedMainRefusals": [{"code": "R", "count": 2, "dates": [{"code": "R", "date": "Wed, 17 Dec", "timeSlot": "19:30-19:52"}, {"code": "R", "date": "Fri, 19 Dec", "timeSlot": "19:30-19:52"}], "medication": "Seretide inhaler 250", "careWorkerName": "JM"}], "officeClosedEntries": [], "verificationResults": {}, "codeConflictDetected": false, "expectedEntriesCount": 84, "totalPrnRefusalCount": 0, "totalEntriesProcessed": 38, "totalMainRefusalCount": 2, "userVerificationItems": [{"code": "SA", "date": "Mon, 15 Dec", "note": "Check if self-administration was appropriate and witnessed", "medication": "Seretide inhaler 250", "careWorkerName": "TP"}, {"code": "SA", "date": "Tue, 16 Dec", "note": "Check if self-administration was appropriate and witnessed", "medication": "Seretide inhaler 250", "careWorkerName": "TP"}, {"code": "R", "date": "Wed, 17 Dec", "note": "Check if refusal reason is documented and acceptable", "medication": "Seretide inhaler 250", "careWorkerName": "JM"}, {"code": "SA", "date": "Thu, 18 Dec", "note": "Check if self-administration was appropriate and witnessed", "medication": "Seretide inhaler 250", "careWorkerName": "TP"}, {"code": "NH", "date": "Mon, 15 Dec", "note": "Check if not home status is documented", "medication": "Donepezil 10mg", "careWorkerName": "LE"}, {"code": "NH", "date": "Mon, 15 Dec", "note": "Check if not home status is documented", "medication": "Metformin 5ml", "careWorkerName": "LE"}, {"code": "R", "date": "Fri, 19 Dec", "note": "Check if refusal reason is documented and acceptable", "medication": "Seretide inhaler 250", "careWorkerName": "JM"}], "refusalReviewDecisions": {}, "refusalReviewSubmitted": false, "initialDiscrepancyCount": 4, "medicationLevelEvidence": "Code counts (regular meds): AD=31, AS=0, P=0. PRN meds: PRN=0, FA=0, MU=0, NH=0, R=0. Service level: ADMINISTER.", "medicationLevelOverride": null, "unknownCareWorkerInitials": ["JG", "LE", "EJ", "KW", "TP", "JM", "EA", "CO"], "totalOtherDiscrepancyCount": 2}	2026-01-02 23:14:30.286238
\.


--
-- Data for Name: blocked_ips; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.blocked_ips (id, ip_address, blocked_by, reason, username, created_at) FROM stdin;
\.


--
-- Data for Name: care_workers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.care_workers (id, name, role, status, created_at) FROM stdin;
\.


--
-- Data for Name: discrepancies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.discrepancies (id, care_worker_id, type, date, description, action, severity, action_medium, manager, notes, created_at) FROM stdin;
\.


--
-- Data for Name: emar_corrections; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.emar_corrections (id, audit_id, admin_id, admin_username, service_user_initials, original_medication, original_date, original_time_slot, original_code, original_care_worker, corrected_medication, corrected_date, corrected_time_slot, corrected_code, corrected_care_worker, correction_note, created_at) FROM stdin;
\.


--
-- Data for Name: emar_refusal_reviews; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.emar_refusal_reviews (id, audit_id, care_worker_name, medication, refusal_date, time_slot, reason_acceptable, reviewer_notes, reviewed_by, reviewed_at, created_at) FROM stdin;
\.


--
-- Data for Name: file_scan_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.file_scan_logs (id, file_name, file_hash, file_size, scan_result, threats_found, scanned_by, upload_type, cached_result, scanned_at) FROM stdin;
b81dda40-f910-4bb1-bce5-6cd21b3b8f72	EMAR-1-3689_1765344478636.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-27 09:16:29.68105
e5304b86-faeb-49cc-a8b4-e93bf5067cc4	EMAR-1-3689_1765344478636.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-27 10:01:43.18293
dbc81ccc-1923-4e45-b2c3-74f5b9557ee6	EMAR-1-3689_1765344478636.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	t	2025-12-27 10:11:55.591667
e7c83d01-24ad-49f5-9ef1-c6616f03f9a6	EMAR-1-3689_1765344478636.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-27 10:23:03.961862
3f536636-049c-4069-9d3a-5ce0f6a4b9a7	EMAR-1-3689_1765344478636.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-27 10:27:13.65521
3808c120-5a98-40d0-8e8b-2a4ad7798370	EMAR-1-3689_1765344478636.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-27 10:31:31.526368
a0a771a3-3664-4155-88e8-fa4b962691e2	EMAR-1-3689_1765344478636.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-27 10:48:11.045353
c3c0c95d-ebf7-42a2-babf-810c66beb320	EMAR-1-3689_1765344478636.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-27 10:51:50.995853
26b60db8-52ea-462d-bf26-4c2401c480a2	EMAR-1-3689_1765344478636.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	t	2025-12-27 10:55:10.257355
82f8ae77-04ea-4c92-8b13-159e23aa9c8b	EMAR-1-3689_1765344478636.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-27 10:57:43.493238
92636fd4-ab3f-4d87-a948-a767243eed94	EMAR-1-3689_1765344478636.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-27 11:16:58.063979
b3168d23-a808-4af5-a57c-0664ac40f344	EMAR-2-4150.pdf	79f7d12c503a0ef7b9625f88f7b8aad7a6e8b8426d379d883d8dafcc41ff13e1	26735	clean	\N	Lewis.barron	emar-analysis	f	2025-12-27 11:23:13.728862
dcd0efdb-0caa-4dad-bbf3-73fddb8955f9	MARGARET SPENCER.pdf	01bfd145a7844a89cd033344528c2b92e4e0d91e76bd764ccd300aaa0eac8b90	1195224	clean	\N	Lewis.barron	parse-pdf	f	2025-12-27 12:05:20.568396
569c6d1c-0f32-4e03-a41a-2579d1753c73	CASE-2-4150 Form 27_Dec_2025.pdf	7fbb0c41dfd4ec37ae4e394b529fd887a1de040b962ef16bc439a71314113238	556508	clean	\N	Lewis.barron	parse-pdf	f	2025-12-27 12:05:23.313507
b0aa5978-94ae-4cfd-aa68-b581396a9227	CASE-2-4150 Care Plans 27_Dec_2025.pdf	0c90d62055ccaaa64c4830b25b16b16c2dca542fa8563ff5acbf1366560a7a0c	402881	clean	\N	Lewis.barron	parse-pdf	f	2025-12-27 12:05:26.119999
195f3bf7-7cbc-4f89-a8b2-07f548784d2a	C2.pdf	01bfd145a7844a89cd033344528c2b92e4e0d91e76bd764ccd300aaa0eac8b90	1195224	clean	\N	Lewis.barron	parse-pdf	f	2025-12-27 12:11:25.21558
ae604675-8321-489d-b2a8-1d71eb6128be	CASE-2-4150 Form 27_Dec_2025.pdf	7fbb0c41dfd4ec37ae4e394b529fd887a1de040b962ef16bc439a71314113238	556508	clean	\N	Lewis.barron	parse-pdf	f	2025-12-27 12:11:33.031428
739ff596-d104-423a-9aff-22216b77057b	CASE-2-4150 Care Plans 27_Dec_2025.pdf	0c90d62055ccaaa64c4830b25b16b16c2dca542fa8563ff5acbf1366560a7a0c	402881	clean	\N	Lewis.barron	parse-pdf	f	2025-12-27 12:11:37.618046
c145378e-b450-4fe4-b12d-c7a15ac8adc7	C2.pdf	01bfd145a7844a89cd033344528c2b92e4e0d91e76bd764ccd300aaa0eac8b90	1195224	clean	\N	Lewis.barron	parse-pdf	f	2025-12-27 12:14:07.597715
6c6ced41-e6d0-4195-89e2-ebc0da3dffec	CASE-2-4150 Form 27_Dec_2025.pdf	7fbb0c41dfd4ec37ae4e394b529fd887a1de040b962ef16bc439a71314113238	556508	clean	\N	Lewis.barron	parse-pdf	f	2025-12-27 12:14:12.691106
47422d99-df3d-4d1b-8189-4903fa6f9714	CASE-2-4150 Care Plans 27_Dec_2025.pdf	0c90d62055ccaaa64c4830b25b16b16c2dca542fa8563ff5acbf1366560a7a0c	402881	clean	\N	Lewis.barron	parse-pdf	f	2025-12-27 12:14:19.621108
7aaf534b-1656-47d6-98c8-112b26a25944	EMAR-1-3689.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-29 19:42:53.270432
b1c5e5d2-f950-42bf-93f4-125f870f532e	EMAR-1-3689.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-29 19:44:59.637783
63aaf52f-be76-44c7-af09-285ae723b59c	EMAR-1-3689.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-29 19:56:49.942504
ee736cb2-595f-4562-851c-76210b1f15bc	EMAR-1-3689.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-29 20:22:03.772714
7b932add-1cb5-4168-9c23-4318c9b9243d	EMAR-1-3689.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-30 09:44:09.844312
a1c3abc6-846e-4db7-9088-7b65fb4a4304	EMAR-1-3689.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2025-12-30 09:50:09.233218
255e9fb0-cee3-4894-b855-420684c97008	EMAR-1-3689_1765344478636.pdf	31cddb3b4ac53b67b2b52caf57c83b2cec7d857d139cc1740690b3290eb223cc	45379	clean	\N	Lewis.barron	emar-analysis	f	2026-01-01 02:53:08.775216
bba7e700-53bb-441c-b4eb-6feeebac2e0b	EMAR-2-4150.pdf	79f7d12c503a0ef7b9625f88f7b8aad7a6e8b8426d379d883d8dafcc41ff13e1	26735	clean	\N	Lewis.barron	emar-analysis	f	2026-01-02 23:13:53.313627
1791cc21-0ebd-41c2-86f0-1f179b77b593	EMAR-2-4150.pdf	79f7d12c503a0ef7b9625f88f7b8aad7a6e8b8426d379d883d8dafcc41ff13e1	26735	clean	\N	Lewis.barron	emar-analysis	f	2026-01-02 23:39:41.706253
7cdb084b-3a8a-4e4a-92c0-f1874eb589de	EMAR-2-4150.pdf	79f7d12c503a0ef7b9625f88f7b8aad7a6e8b8426d379d883d8dafcc41ff13e1	26735	clean	\N	Lewis.barron	emar-analysis	f	2026-01-02 23:41:51.725856
50538467-c244-45d9-8b9c-c461d532c97b	EMAR-2-4150.pdf	79f7d12c503a0ef7b9625f88f7b8aad7a6e8b8426d379d883d8dafcc41ff13e1	26735	clean	\N	Lewis.barron	emar-analysis	f	2026-01-02 23:44:22.269061
87d25b7a-4825-4c6e-a022-1c0e5812f3b1	EMAR-2-4150.pdf	79f7d12c503a0ef7b9625f88f7b8aad7a6e8b8426d379d883d8dafcc41ff13e1	26735	clean	\N	Lewis.barron	emar-analysis	f	2026-01-03 02:11:30.424319
6682f842-28da-4fb6-a793-81021093fed5	EMAR-2-4150.pdf	79f7d12c503a0ef7b9625f88f7b8aad7a6e8b8426d379d883d8dafcc41ff13e1	26735	clean	\N	Lewis.barron	emar-analysis	f	2026-01-03 02:18:46.371607
431b65f6-8f96-4d7b-9c6c-363624890063	EMAR-2-4150.pdf	79f7d12c503a0ef7b9625f88f7b8aad7a6e8b8426d379d883d8dafcc41ff13e1	26735	clean	\N	Lewis.barron	emar-analysis	t	2026-01-03 02:19:52.52618
6feb0b58-4c54-4aff-9ca7-d2fce55d9b54	EMAR-2-4150.pdf	79f7d12c503a0ef7b9625f88f7b8aad7a6e8b8426d379d883d8dafcc41ff13e1	26735	clean	\N	Lewis.barron	emar-analysis	f	2026-01-03 03:11:04.12974
\.


--
-- Data for Name: policy_documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.policy_documents (id, name, category, content, keywords, version, last_updated, created_at) FROM stdin;
\.


--
-- Data for Name: risk_assessment_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.risk_assessment_logs (id, service_user_initials, performed_by, performed_by_job_title, offered_assessments, selected_assessments, skipped_mandatory, document_summary, created_at) FROM stdin;
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session (sid, sess, expire) FROM stdin;
LWOcqTBO7BaUR-9OxK3RAxrk8mgKwa3x	{"cookie":{"originalMaxAge":1800000,"partitioned":true,"expires":"2026-01-03T02:40:01.144Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":"a88120ca-90b7-446a-a1c1-769d3760c9a7"}	2026-01-03 02:59:31
pUIijY7LOrdERJEJe5TkCyXfy0tTJ8Bg	{"cookie":{"originalMaxAge":1800000,"partitioned":true,"expires":"2026-01-03T03:40:47.158Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":"a88120ca-90b7-446a-a1c1-769d3760c9a7"}	2026-01-03 03:41:05
\.


--
-- Data for Name: session_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session_history (id, user_id, username, session_id, ip_address, city, country, logged_in_at, logged_out_at, duration_seconds, terminated_by_admin) FROM stdin;
2319a1da-eb73-4b05-a1df-df9f3bc0684d	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	JeW-l3UABBJ3-xGDmITsJt4p3CS3QZrh	86.31.251.20	\N	\N	2025-12-27 09:12:02.440326	\N	\N	f
8c72fa2a-48b7-4019-b6c9-857720ebbce9	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	fl7r7icvPpWz43XvmirZzlaGR6T6aJIU	86.31.251.20	\N	\N	2025-12-27 10:01:13.072339	\N	\N	f
d5713258-f0ac-4aaa-b333-1307390b1693	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	6L98T-fXI2mcSfdOQTGnqF0s2IXoav--	86.31.251.20	\N	\N	2025-12-27 11:22:02.262715	2025-12-27 12:27:35.756	3933	f
b37a76f8-00d8-4eb5-8a2b-bfc2b9e10399	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	THLsqSw9H1DhlelPD14ml1USpT54tvUp	86.31.251.20	\N	\N	2025-12-27 12:30:52.803911	2025-12-27 12:40:06.89	554	f
c78d6a72-ef85-4ffc-8e53-430622dd0025	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	BYznEte8P8qMSYV8FCek-mIIfMfCqVxe	86.31.251.20	\N	\N	2025-12-27 12:54:55.351735	2025-12-27 12:55:27.001	31	f
638a9dc7-b5dd-4204-af34-164d9c496085	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	Q3lyYmSF8Bixx2Cu6Pbphg3LOOKC9c49	86.31.251.20	\N	\N	2025-12-27 16:12:28.82379	\N	\N	f
213cbfdc-af14-44e4-ab46-0509bf4ef074	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	THIKCKv5vyM2rxXE9Gcrw1h9JaWBw0i-	86.31.251.20	\N	\N	2025-12-27 23:05:15.863659	\N	\N	f
0b43826c-f4bf-499f-86f3-5a690006a5c6	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	01ddh-eLx_9bGXf7mmwoGd54PGvTKGZr	148.252.145.132	\N	\N	2025-12-29 13:05:41.36509	\N	\N	f
bbd9239f-9ba0-4c35-9da0-523e2aea818e	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	9P_E5Ejd8UAhIZ317N1mTZTIMRul3xhx	86.31.251.20	\N	\N	2025-12-29 19:42:25.04834	\N	\N	f
8bfb988f-d857-4fef-8f7c-6feed2becc19	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	3gCmal9-ytjdbc0FDCYQzxZxSMRs4yoE	5.22.143.35	\N	\N	2025-12-30 09:43:34.373635	\N	\N	f
fa1d9064-d744-4479-acb6-ceedb914b57b	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	hYiGjthElh1pcnNnB-cuqCS5sHla_VO8	85.255.235.2	\N	\N	2026-01-01 02:50:56.809617	\N	\N	f
2036f7e9-eb74-49a2-9fe4-af523ba18067	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	g6AJn-ct4rEzhEr8wM_x5NC3SdJimuUe	86.31.251.20	\N	\N	2026-01-02 23:07:39.581751	\N	\N	f
e8deec04-139d-45df-a094-231c8eab6415	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	LWOcqTBO7BaUR-9OxK3RAxrk8mgKwa3x	86.31.251.20	\N	\N	2026-01-03 02:10:01.353502	\N	\N	f
2430d537-a716-4ab5-9c96-8993092f8964	a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	pUIijY7LOrdERJEJe5TkCyXfy0tTJ8Bg	86.31.251.20	\N	\N	2026-01-03 03:10:47.2897	\N	\N	f
\.


--
-- Data for Name: suspension_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.suspension_logs (id, user_id, username, admin_id, admin_username, duration_minutes, reason, starts_at, ends_at, reinstated_early, created_at) FROM stdin;
\.


--
-- Data for Name: system_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_logs (id, event_type, user_id, username, details, service_user_initials, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, username, first_name, last_name, password, role, status, job_title, suspended_until, last_online_at, dashboard_widgets, terms_accepted_at, terms_version, terms_signature_name, terms_signature_date, created_at) FROM stdin;
a88120ca-90b7-446a-a1c1-769d3760c9a7	Lewis.barron	\N	\N	$2b$10$jXfGOMu5gGDmumhkMh/JgO1tZBE4Q.I5dI7ztJH7yAv3fDi/d78W.	admin	active	\N	\N	2026-01-03 03:10:47.292	["compliance_score", "audits_completed", "active_alerts", "plans_updated", "medication_audits", "care_plan_reviews", "risk_assessments", "staff_checks", "compliance_data", "recent_alerts"]	2026-01-03 03:10:57.719	1.0	l.barron	03/01/2026	2025-12-27 09:10:46.861131
\.


--
-- Name: active_sessions active_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_sessions
    ADD CONSTRAINT active_sessions_pkey PRIMARY KEY (id);


--
-- Name: admin_alerts admin_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_alerts
    ADD CONSTRAINT admin_alerts_pkey PRIMARY KEY (id);


--
-- Name: ai_usage_logs ai_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: audits audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audits
    ADD CONSTRAINT audits_pkey PRIMARY KEY (id);


--
-- Name: blocked_ips blocked_ips_ip_address_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_ips
    ADD CONSTRAINT blocked_ips_ip_address_unique UNIQUE (ip_address);


--
-- Name: blocked_ips blocked_ips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_ips
    ADD CONSTRAINT blocked_ips_pkey PRIMARY KEY (id);


--
-- Name: care_workers care_workers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_workers
    ADD CONSTRAINT care_workers_pkey PRIMARY KEY (id);


--
-- Name: discrepancies discrepancies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discrepancies
    ADD CONSTRAINT discrepancies_pkey PRIMARY KEY (id);


--
-- Name: emar_corrections emar_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emar_corrections
    ADD CONSTRAINT emar_corrections_pkey PRIMARY KEY (id);


--
-- Name: emar_refusal_reviews emar_refusal_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emar_refusal_reviews
    ADD CONSTRAINT emar_refusal_reviews_pkey PRIMARY KEY (id);


--
-- Name: file_scan_logs file_scan_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_scan_logs
    ADD CONSTRAINT file_scan_logs_pkey PRIMARY KEY (id);


--
-- Name: policy_documents policy_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_documents
    ADD CONSTRAINT policy_documents_pkey PRIMARY KEY (id);


--
-- Name: risk_assessment_logs risk_assessment_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_assessment_logs
    ADD CONSTRAINT risk_assessment_logs_pkey PRIMARY KEY (id);


--
-- Name: session_history session_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_history
    ADD CONSTRAINT session_history_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: suspension_logs suspension_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suspension_logs
    ADD CONSTRAINT suspension_logs_pkey PRIMARY KEY (id);


--
-- Name: system_logs system_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs
    ADD CONSTRAINT system_logs_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: active_sessions active_sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_sessions
    ADD CONSTRAINT active_sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: admin_alerts admin_alerts_care_worker_id_care_workers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_alerts
    ADD CONSTRAINT admin_alerts_care_worker_id_care_workers_id_fk FOREIGN KEY (care_worker_id) REFERENCES public.care_workers(id);


--
-- Name: discrepancies discrepancies_care_worker_id_care_workers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discrepancies
    ADD CONSTRAINT discrepancies_care_worker_id_care_workers_id_fk FOREIGN KEY (care_worker_id) REFERENCES public.care_workers(id);


--
-- Name: emar_corrections emar_corrections_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emar_corrections
    ADD CONSTRAINT emar_corrections_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id);


--
-- Name: session_history session_history_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_history
    ADD CONSTRAINT session_history_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: suspension_logs suspension_logs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suspension_logs
    ADD CONSTRAINT suspension_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict gpMzYN8hyaIOnTCuM9kHj1rV47orE1omdc8lvyinET8AKYfXJq29uJttNao3esJ

