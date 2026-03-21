import React from 'react'
import { Button } from './Button'
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface PricingFeature {
  name: string
  included: boolean
}

interface PricingCardProps {
  tier: string
  price: string
  period: string
  features: PricingFeature[]
  highlighted?: boolean
  onSubscribe?: () => void
  currentTier?: string
}

export const PricingCard: React.FC<PricingCardProps> = ({
  tier,
  price,
  period,
  features,
  highlighted = false,
  onSubscribe,
  currentTier
}) => {
  const isCurrentTier = currentTier === tier
  const canDowngrade = !isCurrentTier && currentTier && ['pro', 'enterprise'].includes(currentTier)
  
  return (
    <div className={`
      relative rounded-2xl p-8
      ${highlighted 
        ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white ring-4 ring-blue-600/20' 
        : 'bg-white border border-gray-200'
      }
    `}>
      {highlighted && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
            MOST POPULAR
          </span>
        </div>
      )}

      <div className="text-center">
        <h3 className={`text-2xl font-bold ${highlighted ? 'text-white' : 'text-gray-900'}`}>
          {tier}
        </h3>
        <div className="mt-4">
          <span className={`text-4xl font-bold ${highlighted ? 'text-white' : 'text-gray-900'}`}>
            {price}
          </span>
          <span className={`text-sm ${highlighted ? 'text-blue-100' : 'text-gray-500'}`}>
            /{period}
          </span>
        </div>
      </div>

      <ul className="mt-8 space-y-4">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start">
            {feature.included ? (
              <CheckIcon className={`h-5 w-5 flex-shrink-0 ${highlighted ? 'text-blue-100' : 'text-green-500'}`} />
            ) : (
              <XMarkIcon className={`h-5 w-5 flex-shrink-0 ${highlighted ? 'text-blue-100' : 'text-gray-400'}`} />
            )}
            <span className={`ml-3 text-sm ${highlighted ? 'text-blue-100' : 'text-gray-600'}`}>
              {feature.name}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        {isCurrentTier ? (
          <Button
            variant="outline"
            disabled
            className="w-full"
          >
            Current Plan
          </Button>
        ) : canDowngrade ? (
          <Button
            variant="outline"
            onClick={onSubscribe}
            className="w-full"
          >
            Downgrade
          </Button>
        ) : (
          <Button
            variant={highlighted ? "solid" : "outline"}
            onClick={onSubscribe}
            className="w-full"
          >
            {currentTier ? 'Upgrade' : 'Subscribe'}
          </Button>
        )}
      </div>
    </div>
  )
}

export default PricingCard
