const {
  logError
} = require('../logging')
const {
  parseToken
} = require('../eos_helper')

function createCommunity (db, payload, blockInfo) {
  console.log(`BeSpiral >>> Create Community`, blockInfo.blockNumber)

  const [, symbol] = parseToken(payload.data.cmm_asset)

  const communityData = {
    symbol: symbol,
    creator: payload.data.creator,
    logo: payload.data.logo,
    name: payload.data.name,
    description: payload.data.description,
    inviter_reward: parseToken(payload.data.inviter_reward)[0],
    invited_reward: parseToken(payload.data.invited_reward)[0],

    created_block: blockInfo.blockNumber,
    created_tx: payload.transactionId,
    created_eos_account: payload.authorization[0].actor,
    created_at: blockInfo.timestamp
  }

  // create community
  db.communities
    .insert(communityData)
    .then(() => {
      const networkData = {
        community_id: symbol,
        account_id: payload.data.creator,
        invited_by_id: payload.data.creator,
        created_block: blockInfo.blockNumber,
        created_tx: payload.transactionId,
        created_eos_account: payload.authorization[0].actor,
        created_at: blockInfo.timestamp
      }

      // invite community creator
      db.network
        .insert(networkData)
        .catch(e => logError('Something went wrong while adding community creator to network', e))
    })
    .catch(e => logError('Something went wrong while inserting a new community', e))
}

function updateCommunity (db, payload, blockInfo, context) {
  console.log(`BeSpiral >>> Update community logo`, blockInfo.blockNumber)

  const [, symbol] = parseToken(payload.data.cmm_asset)

  const updateData = {
    symbol: symbol,
    logo: payload.data.logo,
    name: payload.data.name,
    description: payload.data.description,
    inviter_reward: parseToken(payload.data.inviter_reward)[0],
    invited_reward: parseToken(payload.data.invited_reward)[0]
  }

  // Find the community
  db.communities
    .update({
      symbol: symbol
    }, updateData)
    .catch(e => logError('Something went wrong while updating community logo', e))
}

function netlink (db, payload, blockInfo, context) {
  console.log(`BeSpiral >>> New Netlink`, blockInfo.blockNumber)

  // Check if user isn't already created
  db.users
    .count({
      account: payload.data.new_user
    })
    .then(total => {
      const profileData = {
        account: payload.data.new_user,
        created_block: blockInfo.blockNumber,
        created_tx: payload.transactionId,
        created_eos_account: payload.authorization[0].actor,
        created_at: blockInfo.timestamp
      }

      if (total === '0') {
        db.users
          .insert(profileData)
          .catch(e => logError('Something went wrong while inserting user', e))
      }
    })
    .then(() => {
      const [, symbol] = parseToken(payload.data.cmm_asset)

      const networkData = {
        community_id: symbol,
        account_id: payload.data.new_user,
        invited_by_id: payload.authorization[0].actor,
        created_block: blockInfo.blockNumber,
        created_tx: payload.transactionId,
        created_eos_account: payload.authorization[0].actor,
        created_at: blockInfo.timestamp
      }

      db.network
        .insert(networkData)
        .catch(e => logError('Something went wrong while adding user to network table', e))
    })
    .catch(e => logError('Something went wrong while counting for existing users', e))
}

function createSale (db, payload, blockInfo, context) {
  console.log(`BeSpiral >>> New Sale`, blockInfo.blockNumber)

  const [price, symbol] = parseToken(payload.data.quantity)
  const trackStock = payload.data.track_stock === 1
  const units = trackStock ? payload.data.units : 0

  const data = {
    community_id: symbol,
    title: payload.data.title,
    description: payload.data.description,
    price: price,
    image: payload.data.image,
    units: units,
    track_stock: trackStock,
    is_deleted: false,
    creator_id: payload.data.from,
    created_block: blockInfo.blockNumber,
    created_tx: payload.transactionId,
    created_eos_account: payload.authorization[0].actor,
    created_at: blockInfo.timestamp
  }

  // Insert sale on database
  db.sales
    .insert(data)
    .catch(e => logError('Something went wrong while creating a new sale', e))
}

function updateSale (db, payload, blockInfo, context) {
  console.log(`BeSpiral >>> Update sale`, blockInfo.blockNumber)

  const whereArg = {
    id: payload.data.sale_id,
    is_deleted: false
  }

  db.sales
    .findOne(whereArg)
    .then(sale => {
      if (sale == null) {
        throw new Error('No sale data available')
      }

      const [price] = parseToken(payload.data.quantity)
      const units = sale.track_stock ? payload.data.units : 0
      const trackStock = payload.data.track_stock === 1

      // Update sale data
      const updateData = {
        title: payload.data.title,
        description: payload.data.description,
        price: price,
        image: payload.data.image,
        track_stock: trackStock,
        units: units
      }

      db.sales
        .update(whereArg, updateData)
        .catch(e => logError('Something went wrong while updating sale, make sure that sale is not deleted', e))
    })
    .catch(e => logError('Something went wrong while looking for the sale, make sure that sale is not deleted', e))
}

function deleteSale (db, payload, blockInfo, context) {
  console.log(`BeSpiral >>> Remove sale`, blockInfo.blockNumber)

  // Soft delete sale
  const updateData = {
    is_deleted: true,
    deleted_at: blockInfo.timestamp
  }

  db.sales
    .update({
      id: payload.data.sale_id,
      is_deleted: false
    }, updateData)
    .catch(e => logError('Something went wrong while removing sale, make sure that sale is not deleted', e))
}

function reactSale (db, payload, blockInfo, context) {
  console.log(`BeSpiral >>> Vote in a sale`, blockInfo.blockNumber)

  const transaction = (tx) => {
    // Find sale
    tx.sales
      .findOne({
        id: payload.data.sale_id,
        is_deleted: false
      })
      .then(sale => {
        if (sale === null) {
          throw new Error('No sale data available')
        }

        const whereArg = {
          sale_id: sale.id,
          account_id: payload.data.from
        }

        // Check if sale was previously voted
        tx.sale_ratings
          .count(whereArg)
          .then(total => {
            if (total === '0') {
              const data = {
                sale_id: sale.id,
                account_id: payload.data.from,
                rating: payload.data.type,
                created_block: blockInfo.blockNumber,
                created_tx: payload.transactionId,
                created_eos_account: payload.authorization[0].actor,
                created_at: blockInfo.timestamp
              }

              tx.sale_ratings
                .insert(data)
            } else {
              const updateData = {
                rating: payload.data.type
              }

              tx.sale_ratings
                .update(whereArg, updateData)
            }
          })
      })
  }

  db.withTransaction(transaction)
    .catch(e => logError('Something went wrong while reacting to a sale, make sure that sale is not deleted', e))
}

function transferSale (db, payload, blockInfo, context) {
  console.log(`BeSpiral >>> New Transfer Sale`, blockInfo.blockNumber)

  const transaction = (tx) => {
    const [amount, symbol] = parseToken(payload.data.quantity)

    const whereArg = {
      id: payload.data.sale_id,
      is_deleted: false
    }

    // Find sale
    return tx.sales
      .findOne(whereArg)
      .then(sale => {
        if (sale === null) {
          throw new Error('No sale data available')
        }

        // Update sale units
        const updateData = {
          units: sale.units - parseInt(payload.data.units)
        }

        tx.sales
          .update(whereArg, updateData)

        // Insert new sale transfer history
        const insertData = {
          sale_id: sale.id,
          from_id: payload.data.from,
          to_id: payload.data.to,
          amount: amount,
          units: payload.data.units,
          community_id: symbol,
          created_block: blockInfo.blockNumber,
          created_tx: payload.transactionId,
          created_at: blockInfo.timestamp,
          created_eos_account: payload.authorization[0].actor
        }

        tx.sale_history
          .insert(insertData)
      })
  }

  db.withTransaction(transaction)
    .catch(e => logError('Something went wrong while transferring sale', e))
}

function newObjective (db, payload, blockInfo, context) {
  console.log(`BeSpiral >>> New Objective`, blockInfo.blockNumber)

  const [, symbol] = parseToken(payload.data.cmm_asset)

  // Add to objective table
  const objectiveData = {
    community_id: symbol,
    creator_id: payload.data.creator,
    description: payload.data.description,
    created_block: blockInfo.blockNumber,
    created_tx: payload.transactionId,
    created_at: blockInfo.timestamp,
    created_eos_account: payload.authorization[0].actor
  }

  db.objectives
    .insert(objectiveData)
    .catch(e => logError('Something went wrong creating objective', e))
}

function updateObjective (db, payload, blockInfo, context) {
  console.log(`BeSpiral >>> Update Objective`, blockInfo.blockNumber)

  const where = { id: payload.data.objective_id }

  db.objectives
    .findOne(where)
    .then(obj => {
      if (obj == null) {
        throw new Error('No objective found in the database')
      }

      const updateData = {
        description: payload.data.description
      }

      db.objectives
        .update(where, updateData)
        .catch(e => logError('Something went wrong while updating objective', e))
    })
    .catch(e => logError('Something went wrong while looking for the objective', e))
}

function upsertAction (db, payload, blockInfo, context) {
  console.log(`BeSpiral >>> Upsert Action`, blockInfo.blockNumber)

  const [rewardAmount] = parseToken(payload.data.reward)
  const [verifierAmount] = parseToken(payload.data.verifier_reward)
  const deadlineDateTime = new Date(parseInt(payload.data.deadline))
  const validators = payload.data.validators_str.length > 0 ? payload.data.validators_str.split('-') : []

  db.objectives
    .findOne({ id: payload.data.objective_id })
    .then(o => {
      if (o === null) {
        console.error(`Objective with the id ${payload.data.objective_id} does not exist`)
        return
      }

      let data = {
        objective_id: payload.data.objective_id,
        creator_id: payload.data.creator,
        description: payload.data.description,
        reward: rewardAmount,
        verifier_reward: verifierAmount,
        is_completed: false,
        usages: payload.data.usages,
        usages_left: payload.data.usages,
        verifications: payload.data.verifications,
        verification_type: payload.data.verification_type,
        deadline: payload.data.deadline > 0 ? deadlineDateTime : null,
        created_block: blockInfo.blockNumber,
        created_tx: payload.transactionId,
        created_at: blockInfo.timestamp,
        created_eos_account: payload.authorization[0].actor
      }

      if (payload.data.action_id > 0) {
        // Update
        data = Object.assign(data, {
          id: payload.data.action_id,
          usages_left: payload.data.usages_left,
          is_completed: payload.data.is_completed === 1
        })
      }

      db.withTransaction(tx => {
        return tx.actions
          .save(data)
          .then(savedAction => {
            // In case of a update delete all older validators and add new ones
            if (payload.data.action_id > 0) {
              db.validators.destroy({ action_id: payload.data.action_id })
                .catch(e => logError('Something went wrong while deleting old validators', e))
            }

            validators.map(validator => {
              const validatorData = {
                action_id: savedAction.id,
                validator_id: validator,
                created_block: blockInfo.blockNumber,
                created_tx: payload.transactionId,
                created_eos_account: payload.authorization[0].actor,
                created_at: blockInfo.timestamp
              }

              tx.validators
                .insert(validatorData)
                .catch(e => logError('Something went wrong while adding a validator to the list', e))
            })
          })
          .catch(e => logError('Error while creating an action', e))
      }).catch(e => logError('Something went wrong while executing transaction to create an action', e))
    })
}

function verifyAction (db, payload, blockInfo, context) {
  console.log(`BeSpiral >>> Action verification`, blockInfo.blockNumber)

  // Collect the action
  db.actions
    .findOne(payload.data.action_id)
    .then(a => {
      if (a === null) {
        throw new Error('action not available')
      }

      const completed = a.usages_left - 1 <= 0

      const updateData = {
        usages_left: a.usages_left - 1,
        is_completed: completed
      }

      db.actions
        .update({
          id: payload.data.action_id
        }, updateData)
        .catch(e => logError('Something went wrong while verifying an action', e))
    })
    .catch(e => logError('Something went wrong while finding an action', e))
}

function claimAction (db, payload, blockInfo, context) {
  console.log(`BeSpiral >>> Claiming an Action`, blockInfo.blockNumber)

  const data = {
    action_id: payload.data.action_id,
    claimer_id: payload.data.maker,
    is_verified: false,
    created_block: blockInfo.blockNumber,
    created_tx: payload.transactionId,
    created_eos_account: payload.authorization[0].actor,
    created_at: blockInfo.timestamp
  }

  db.claims
    .insert(data)
    .catch(e => logError('Something went wrong while inserting a claim', e))
}

function verifyClaim (db, payload, blockInfo, context) {
  console.log(`BeSpiral >>> Claim Verification`, blockInfo.blockNumber)

  const checkData = {
    claim_id: payload.data.claim_id,
    validator_id: payload.data.verifier,
    is_verified: payload.data.vote === 1,
    created_block: blockInfo.blockNumber,
    created_tx: payload.transactionId,
    created_eos_account: payload.authorization[0].actor,
    created_at: blockInfo.timestamp
  }

  db.withTransaction(tx => {
    // Save the Check
    return tx.checks
      .insert(checkData)
      .then(check => {
        // Find the checks claim
        tx.claims
          .findOne(check.claim_id)
          .then(claim => {
            if (claim === null) {
              throw new Error('claim not available')
            }

            // Find the claims action
            tx.actions
              .findOne(claim.action_id)
              .then(action => {
                if (action === null) {
                  throw new Error('action not available')
                }

                // Count verified checks
                tx.checks
                  .count({
                    claim_id: claim.id,
                    is_verified: true
                  })
                  .then(total => {
                    // Set claim as completed
                    if (Number(total) >= action.verifications) {
                      tx.claims
                        .update(claim.id, { is_verified: true })

                      // Check if all usages are used
                      if (action.usages > 0 && (action.usages_left >= 1)) {
                        const updateData = {
                          usages_left: action.usages_left - 1,
                          is_completed: (action.usages_left - 1 === 0)
                        }

                        tx.actions.update(action.id, updateData)
                      }
                    }
                  })
              })
          })
      })
  })
    .catch(e => logError('Something went wrong while inserting a check', e))
}

module.exports = {
  createCommunity,
  updateCommunity,
  netlink,
  newObjective,
  updateObjective,
  upsertAction,
  verifyAction,
  createSale,
  updateSale,
  deleteSale,
  reactSale,
  transferSale,
  verifyClaim,
  claimAction
}
