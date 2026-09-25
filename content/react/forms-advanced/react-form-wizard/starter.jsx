import { useEffect, useId, useRef, useState } from 'react';

function ContactStep() {
  const [email, setEmail] = useState('');
  return (
    <label>
      Email
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
    </label>
  );
}

function ShippingStep() {
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  return (
    <>
      <label>
        Address
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <label>
        City
        <input value={city} onChange={(e) => setCity(e.target.value)} />
      </label>
    </>
  );
}

// TODO: values that survive moving between steps, per-step validation,
// focus on the step heading, a review step, and a single, guarded submit.
export function CheckoutWizard({ onSubmit }) {
  const [step, setStep] = useState(0);
  return (
    <form onSubmit={(event) => { event.preventDefault(); setStep(step + 1); }}>
      <h2>Checkout</h2>
      {step === 0 && <ContactStep />}
      {step === 1 && <ShippingStep />}
      {step > 0 && <button type="button" onClick={() => setStep(step - 1)}>Back</button>}
      <button type="submit">Next</button>
    </form>
  );
}
