import { Button } from "@/components/ui/button"

const HeartbeatEffectButton = ({ onClick }) => {
  return (
    <Button
      onClick={onClick}
      className="cursor-pointer bg-[#dc2626] hover:bg-[#b91c1c] text-white border-none px-5 py-2 rounded-lg"
    >
      Log out
    </Button>
  )
}

export default HeartbeatEffectButton
