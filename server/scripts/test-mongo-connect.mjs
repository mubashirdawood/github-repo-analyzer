import dotenv from 'dotenv'
import mongoose from 'mongoose'

dotenv.config()

const uri = process.env.MONGO_URI || ''
const m = uri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]+)/)
if (!m) {
  console.error('Could not parse MONGO_URI')
  process.exit(1)
}

const [, user, pass, , db] = m
const hosts = [
  'ac-yrn856s-shard-00-00.pzwpnbg.mongodb.net:27017',
  'ac-yrn856s-shard-00-01.pzwpnbg.mongodb.net:27017',
  'ac-yrn856s-shard-00-02.pzwpnbg.mongodb.net:27017',
]

const std = `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${hosts.join(',')}/${db}?tls=true&authSource=admin&retryWrites=true&w=majority`

console.log('Trying standard (non-SRV) connection...')
try {
  await mongoose.connect(std, { serverSelectionTimeoutMS: 20000 })
  console.log('CONNECTED OK — db:', mongoose.connection.name)
  const hello = await mongoose.connection.db.admin().command({ hello: 1 })
  console.log('replicaSet:', hello.setName || '(none)')
  await mongoose.disconnect()
  process.exit(0)
} catch (e) {
  console.error('FAIL:', e.message)
  process.exit(1)
}
