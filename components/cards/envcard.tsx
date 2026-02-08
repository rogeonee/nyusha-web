export default function EnvCard() {
  const hasGoogleKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  return (
    !hasGoogleKey && (
      <div className="absolute inset-0 top-10 left-0 right-0 flex items-center justify-center w-md">
        <div className="bg-red-500 text-slate-50 rounded shadow-md p-2 leading-tight">
          <h2 className="text-sm font-bold">Heads up!</h2>
          <p className="text-xs flex flex-col">
            <span>
              You need to add a GOOGLE_GENERATIVE_AI_API_KEY environment
              variable.
            </span>
            <span>See the .env.example file for an example.</span>
          </p>
        </div>
      </div>
    )
  );
}
