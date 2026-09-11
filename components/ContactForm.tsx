import { sendContactMessage } from "@/app/contact/actions";

type ContactFormProps = {
  error?: string;
  formContext?: string;
  redirectPath?: "/contact" | "/partner";
  sent?: string;
};

export function ContactForm({
  error,
  formContext = "contact",
  redirectPath = "/contact",
  sent,
}: ContactFormProps) {
  const startedAt = Date.now().toString();

  return (
    <>
      {sent ? (
        <p className="form-success">Message sent. Thanks for reaching out!</p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <form action={sendContactMessage} className="contact-form">
        <input name="redirect_path" type="hidden" value={redirectPath} />
        <input name="form_context" type="hidden" value={formContext} />
        <input name="started_at" type="hidden" value={startedAt} />
        <label className="contact-hidden-field">
          Website
          <input autoComplete="off" name="website" tabIndex={-1} />
        </label>
        <label className="contact-hidden-field">
          Company URL
          <input autoComplete="off" name="company_url" tabIndex={-1} />
        </label>
        <div className="name-grid">
          <label>
            First Name
            <input autoComplete="given-name" name="first_name" required />
          </label>
          <label>
            Last Name
            <input autoComplete="family-name" name="last_name" required />
          </label>
        </div>
        <label>
          Email
          <input autoComplete="email" name="email" type="email" required />
        </label>
        <label>
          What is this about?
          <select name="inquiry_type" required defaultValue="">
            <option value="" disabled>
              Select one
            </option>
            <option value="brand_partnership">Brand partnership</option>
            <option value="product_review">Product review request</option>
            <option value="media_inquiry">Media inquiry</option>
            <option value="viewer_question">Viewer question</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Subject
          <input name="subject" required />
        </label>
        <label>
          Message
          <textarea name="message" required />
        </label>
        <button className="button" type="submit">
          Submit
        </button>
      </form>
    </>
  );
}
