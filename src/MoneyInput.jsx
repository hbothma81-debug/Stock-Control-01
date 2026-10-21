// A price box: a grey R inside its left edge. See UnitInput.jsx.
import UnitInput from "./UnitInput.jsx";

export default function MoneyInput(props) {
  return <UnitInput prefix="R" {...props} />;
}
