-- Access analytics and its consent UI are no longer part of the application.
-- Keep terms and other user consent records intact.
delete from public.user_consents
where consent_type = 'analytics';
