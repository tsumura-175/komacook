alter table public.ocr_imports drop constraint if exists ocr_imports_check;
alter table public.ocr_imports add constraint ocr_imports_source_image_required_while_processing
  check (status not in ('uploaded', 'processing') or source_image_path is not null);
